#!/usr/bin/env node
// Downloads the third-party sidecar executables (realesrgan-ncnn-vulkan,
// ffmpeg, ffprobe) that tauri.conf.json's externalBin and the video
// pipeline need but this repo does not commit -- see src-tauri/binaries/
// and .gitignore's `*.exe`. Replaces the old manual "download these three
// files by hand" README table with something CI and local setup both run.
//
// realesrgan-ncnn-vulkan's source and hashes are pinned in
// src-tauri/sidecar-manifest.json. ffmpeg is not: this script defers to
// src-tauri/resources/provision-ffmpeg.ps1, the same script the installer
// and the app's own on-demand retry run, so there is exactly one place
// that resolves ffmpeg's current build and verifies it -- see that
// script's own comment for why it resolves dynamically instead of
// reading a pin from the manifest.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tauriDir = path.join(root, 'src-tauri');
const binariesDir = path.join(tauriDir, 'binaries');
const manifestPath = path.join(tauriDir, 'sidecar-manifest.json');
const provisionFfmpegScript = path.join(tauriDir, 'resources', 'provision-ffmpeg.ps1');
const force = process.argv.includes('--force');
const requestedPackages = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

if (process.platform !== 'win32') {
  console.error('Sidecar fetch only supports Windows right now (Upscaly is Windows-only) -- see README.');
  process.exit(1);
}

// Not just `tar` off PATH: on a machine with Git for Windows (i.e. most
// Windows dev machines), running this from Git Bash puts Git's bundled GNU
// tar ahead of the real one on PATH. GNU tar parses an absolute Windows
// path like "C:\Users\..." as a "host:file" remote-archive spec and dies
// with "Cannot connect to C: resolve failed" -- it never reaches the
// filesystem. The Windows-native bsdtar at this fixed path (shipped since
// Windows 10 1803) handles drive letters correctly.
const tarExe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
if (!existsSync(tarExe)) {
  console.error(`Windows tar.exe not found at ${tarExe} (expected on Windows 10 1803+/Windows 11).`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')).windows;

async function sha256OfFile(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

async function downloadTo(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const fs = await import('node:fs/promises');
  await fs.writeFile(destPath, buffer);
}

async function verifyHash(filePath, expected, label) {
  const actual = await sha256OfFile(filePath);
  if (actual !== expected) {
    throw new Error(`${label}: SHA-256 mismatch\n  expected ${expected}\n  actual   ${actual}`);
  }
}

async function processPackage(name, pkg) {
  const missing = pkg.entries.filter((e) => !existsSync(path.join(binariesDir, e.dest)));
  if (!force && missing.length === 0) {
    console.log(`[skip] ${name} -- all ${pkg.entries.length} file(s) already present`);
    return;
  }

  console.log(`[fetch] ${name} <- ${pkg.archive_url}`);
  // Staged inside binariesDir itself, not the OS temp dir: the final
  // renameSync must land on the same volume it started on, and a project
  // checkout living on a different drive from %TEMP% (e.g. repo on D:,
  // %TEMP% on C: -- an entirely ordinary Windows setup) makes a plain
  // os.tmpdir() staging area fail every rename with EXDEV.
  const workDir = mkdtempSync(path.join(binariesDir, '.fetch-tmp-'));
  try {
    const archivePath = path.join(workDir, 'archive.zip');
    await downloadTo(pkg.archive_url, archivePath);
    await verifyHash(archivePath, pkg.archive_sha256, `${name} archive`);

    execFileSync(tarExe, [
      '-xf',
      archivePath,
      '-C',
      workDir,
      ...pkg.entries.map((e) => e.path_in_archive),
    ]);

    // Verify every entry before moving any of them -- a hash mismatch on
    // entry 2 must not leave entry 1 already sitting in src-tauri/binaries/.
    for (const entry of pkg.entries) {
      await verifyHash(path.join(workDir, entry.path_in_archive), entry.sha256, `${name}/${entry.dest}`);
    }
    for (const entry of pkg.entries) {
      renameSync(path.join(workDir, entry.path_in_archive), path.join(binariesDir, entry.dest));
      console.log(`  -> ${entry.dest} (verified)`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// ffmpeg's own dest filenames, kept in sync with provision-ffmpeg.ps1 by
// hand since the manifest no longer lists them.
const ffmpegEntries = [
  { dest: 'ffmpeg-x86_64-pc-windows-msvc.exe' },
  { dest: 'ffprobe-x86_64-pc-windows-msvc.exe' },
];

function fetchFfmpeg() {
  const missing = ffmpegEntries.filter((e) => !existsSync(path.join(binariesDir, e.dest)));
  if (!force && missing.length === 0) {
    console.log(`[skip] ffmpeg -- all ${ffmpegEntries.length} file(s) already present`);
    return;
  }
  if (force) {
    // provision-ffmpeg.ps1 only fetches when a destination file is
    // missing -- there is no hash to re-check a "latest" build against,
    // so --force has to clear the way itself rather than pass a flag
    // the script does not have.
    for (const entry of ffmpegEntries) {
      const p = path.join(binariesDir, entry.dest);
      if (existsSync(p)) unlinkSync(p);
    }
  }

  console.log('[fetch] ffmpeg <- resolved dynamically by provision-ffmpeg.ps1 (see that script)');
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    provisionFfmpegScript,
    '-InstallDir',
    tauriDir,
  ], { stdio: 'inherit' });

  const stillMissing = ffmpegEntries.filter((e) => !existsSync(path.join(binariesDir, e.dest)));
  if (stillMissing.length > 0) {
    throw new Error(
      `provision-ffmpeg.ps1 finished but did not produce: ${stillMissing.map((e) => e.dest).join(', ')}`
    );
  }
  for (const entry of ffmpegEntries) {
    console.log(`  -> ${entry.dest} (verified)`);
  }
}

let failed = false;
for (const [name, pkg] of Object.entries(manifest)) {
  if (requestedPackages.length > 0 && !requestedPackages.includes(name)) {
    continue;
  }
  try {
    await processPackage(name, pkg);
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed = true;
  }
}
if (requestedPackages.length === 0 || requestedPackages.includes('ffmpeg')) {
  try {
    fetchFfmpeg();
  } catch (err) {
    console.error(`[FAIL] ffmpeg: ${err.message}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nOne or more sidecars failed to fetch or verify. Nothing partial was left in src-tauri/binaries/.');
  process.exit(1);
}

console.log('\nAll sidecars present and verified in src-tauri/binaries/.');

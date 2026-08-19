#!/usr/bin/env node
// Downloads the third-party sidecar executables (realesrgan-ncnn-vulkan,
// ffmpeg, ffprobe) that tauri.conf.json's externalBin and the video
// pipeline need but this repo does not commit -- see src-tauri/binaries/
// and .gitignore's `*.exe`. Replaces the old manual "download these three
// files by hand" README table with something CI and local setup both run.
//
// Sources and hashes are pinned in src-tauri/sidecar-manifest.json, the
// single source of truth this script and the install-time fetcher (added
// in a later phase) both read.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const binariesDir = path.join(root, 'src-tauri', 'binaries');
const manifestPath = path.join(root, 'src-tauri', 'sidecar-manifest.json');
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

if (failed) {
  console.error('\nOne or more sidecars failed to fetch or verify. Nothing partial was left in src-tauri/binaries/.');
  process.exit(1);
}

console.log('\nAll sidecars present and verified in src-tauri/binaries/.');

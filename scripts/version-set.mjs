#!/usr/bin/env node
// Syncs the app version across every file that declares it. tauri.conf.json
// is the authoritative source everywhere else in the release pipeline (the
// release workflow diffs it against the latest published tag), so this
// script is the only place package.json and Cargo.toml are allowed to drift
// from it -- run it instead of editing any of the three by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run version:set <major.minor.patch>');
  console.error('Example: npm run version:set 1.2.0');
  process.exit(1);
}

const packageJsonPath = path.join(root, 'package.json');
const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(root, 'src-tauri', 'Cargo.toml');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
packageJson.version = version;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
tauriConf.version = version;
writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`);

const cargoToml = readFileSync(cargoTomlPath, 'utf-8');
const versionLine = /^version = "[^"]+"/m;
if (!versionLine.test(cargoToml)) {
  console.error(`Could not find a version field to replace in ${cargoTomlPath}`);
  process.exit(1);
}
writeFileSync(cargoTomlPath, cargoToml.replace(versionLine, `version = "${version}"`));

// Cargo.lock records the workspace member's own version too. No compilation
// needed to refresh it -- cargo metadata just reads the manifests.
execFileSync(
  'cargo',
  ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--format-version', '1', '-q'],
  { cwd: root, stdio: 'ignore' }
);

console.log(`Version set to ${version} in package.json, tauri.conf.json, Cargo.toml and Cargo.lock.`);

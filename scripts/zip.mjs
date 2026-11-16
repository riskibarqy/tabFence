import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const manifestText = readFileSync('manifest.json', 'utf8');
const packageText = readFileSync('package.json', 'utf8');
const manifest = JSON.parse(manifestText);
const pkg = JSON.parse(packageText);
const parts = manifest.version.split('.');
if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part)) || pkg.version !== manifest.version) {
  throw new Error('manifest.json and package.json must have the same three-part version');
}
const patch = Number(parts[2]) + 1;
if (patch > 65535) throw new Error('Chrome version component cannot exceed 65535');
parts[2] = String(patch);
const version = parts.join('.');
const updateVersion = (text) => text.replace(/("version"\s*:\s*")[^"]+"/, `$1${version}"`);
const nextManifest = updateVersion(manifestText);
const nextPackage = updateVersion(packageText);
const archive = resolve(`tabfence-${version}.zip`);
if (existsSync(archive)) throw new Error(`Archive already exists: ${archive}`);
const temp = mkdtempSync(join(tmpdir(), 'tabfence-'));
try {
  writeFileSync(join(temp, 'manifest.json'), nextManifest);
  cpSync('src', join(temp, 'src'), { recursive: true });
  cpSync('popup', join(temp, 'popup'), { recursive: true });
  execFileSync('zip', ['-q', '-r', archive, 'manifest.json', 'src', 'popup'], { cwd: temp, stdio: 'inherit' });
  writeFileSync('manifest.json', nextManifest);
  writeFileSync('package.json', nextPackage);
  console.log(`Created tabfence-${version}.zip`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

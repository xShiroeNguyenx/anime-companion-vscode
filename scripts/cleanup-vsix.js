const fs = require('fs');
const path = require('path');

const MAX_VSIX_FILES = 10;
const cwd = process.cwd();
const packageJson = require(path.join(cwd, 'package.json'));
const packageName = packageJson.name;
const prefix = `${packageName}-`;
const suffix = '.vsix';

function parseVersion(versionText) {
  const parts = versionText.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return parts;
}

function compareVersions(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }
  return 0;
}

const vsixFiles = fs
  .readdirSync(cwd)
  .filter((file) => file.startsWith(prefix) && file.endsWith(suffix))
  .map((file) => {
    const versionText = file.slice(prefix.length, -suffix.length);
    const parsedVersion = parseVersion(versionText);
    return parsedVersion ? { file, parsedVersion } : null;
  })
  .filter(Boolean)
  .sort((left, right) => compareVersions(right.parsedVersion, left.parsedVersion));

const filesToDelete = vsixFiles.slice(MAX_VSIX_FILES);

for (const entry of filesToDelete) {
  fs.unlinkSync(path.join(cwd, entry.file));
  console.log(`[cleanup-vsix] Deleted ${entry.file}`);
}

console.log(
  `[cleanup-vsix] Keeping ${Math.min(vsixFiles.length, MAX_VSIX_FILES)} of ${vsixFiles.length} VSIX file(s).`
);

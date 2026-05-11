#!/usr/bin/env node
/*
 * Zips dist/voice-assets/{lang}/ -> dist/voice-assets/{lang}.zip for every
 * language directory present. Uses adm-zip (already a runtime dep).
 *
 * Usage: node scripts/pack-voice-assets.js [--lang=en,vi]
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(REPO_ROOT, 'dist', 'voice-assets');

function parseArgs(argv) {
  const out = { langs: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--lang=')) {
      out.langs = arg.slice('--lang='.length).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv);

  if (!fs.existsSync(OUT_ROOT)) {
    console.error(`Nothing to pack — ${OUT_ROOT} does not exist. Run "npm run voice:generate" first.`);
    process.exit(1);
  }

  const entries = fs.readdirSync(OUT_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !opts.langs || opts.langs.includes(name));

  if (entries.length === 0) {
    console.error('No language directories found to pack.');
    process.exit(1);
  }

  for (const lang of entries) {
    const srcDir = path.join(OUT_ROOT, lang);
    const zipPath = path.join(OUT_ROOT, `${lang}.zip`);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    const zip = new AdmZip();
    for (const file of fs.readdirSync(srcDir)) {
      const full = path.join(srcDir, file);
      if (!fs.statSync(full).isFile()) continue;
      zip.addLocalFile(full);
    }
    zip.writeZip(zipPath);
    const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
    console.log(`[pack] ${lang}.zip (${sizeKb} KB)`);
  }
}

main();

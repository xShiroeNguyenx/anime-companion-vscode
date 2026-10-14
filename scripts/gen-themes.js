// Writes themes/*.json from src/bundled-themes.ts (via the compiled out/).
// Run `npm run themes:generate` after changing a palette; scripts/theme-test.js
// fails until the files on disk match again.
const fs = require('fs');
const path = require('path');
const { BUNDLED_THEMES, buildThemeJson } = require('../out/bundled-themes.js');

const dir = path.resolve(__dirname, '..', 'themes');
fs.mkdirSync(dir, { recursive: true });
for (const theme of BUNDLED_THEMES) {
  const file = path.join(dir, theme.file);
  fs.writeFileSync(file, JSON.stringify(buildThemeJson(theme), null, 2) + '\n');
  console.log('[gen-themes] wrote', path.relative(process.cwd(), file));
}

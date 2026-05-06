// Local build helper for the floating desktop pet sidecar.
//
// Wraps `cargo build --release` so contributors don't need to remember the
// working directory or flags. Phase C ships Windows-only; Mac/Linux land in
// v1.1+ once Apple Developer ID and CI matrix are in place.
//
// Prereqs (one-time setup):
//   1. Install Rust (stable):       https://rustup.rs
//   2. Install Microsoft C++ build tools (Windows only — already present if you
//      have Visual Studio with Desktop development with C++).
//   3. Install Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
//
// After build, the binary lands at:
//   desktop-pet/target/release/anime-companion-pet.exe
//
// The extension auto-detects this path. Or set
// `animeCompanion.desktopPet.devBinaryPath` to a custom location.

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const sidecarDir = path.join(repoRoot, 'desktop-pet');

if (!fs.existsSync(path.join(sidecarDir, 'Cargo.toml'))) {
  console.error('[build-desktop-pet] desktop-pet/Cargo.toml not found.');
  process.exit(1);
}

// Tauri's build script embeds desktop-pet/icons/icon.ico as the .exe resource
// and Tauri's generate_context! macro decodes it as the default window icon.
// Auto-generate it from media/icon.png on Windows if missing so contributors
// don't need to remember the conversion step. Linux/Mac can supply their own
// when those targets land.
function ensureIconIco() {
  const iconIco = path.join(sidecarDir, 'icons', 'icon.ico');
  if (fs.existsSync(iconIco)) return;
  if (process.platform !== 'win32') {
    console.warn(
      `[build-desktop-pet] icons/icon.ico missing and auto-generation only ` +
        `runs on Windows. Build will fail; please supply icon.ico manually.`
    );
    return;
  }

  const srcPng = path.join(repoRoot, 'media', 'icon.png');
  if (!fs.existsSync(srcPng)) {
    console.warn('[build-desktop-pet] media/icon.png not found; cannot generate icon.ico');
    return;
  }

  console.log('[build-desktop-pet] icons/icon.ico missing — generating from media/icon.png');
  fs.mkdirSync(path.dirname(iconIco), { recursive: true });

  // Re-encode the source PNG as 32-bit RGBA before wrapping it in an ICO
  // container. The bundled icon.png is paletted, which Tauri's image decoder
  // rejects ("Unsupported PNG color type: Indexed"); System.Drawing forces
  // RGBA when we draw it onto a Format32bppArgb bitmap.
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$orig = [System.Drawing.Image]::FromFile('${srcPng.replace(/\\/g, '\\\\')}')
$rgba = New-Object System.Drawing.Bitmap($orig.Width, $orig.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($rgba)
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($orig, 0, 0, $orig.Width, $orig.Height)
$g.Dispose(); $orig.Dispose()
$pngStream = New-Object System.IO.MemoryStream
$rgba.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$rgba.Dispose()
$pngBytes = $pngStream.ToArray(); $pngStream.Dispose()
$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($ms)
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0)
$w.Write([UInt16]1); $w.Write([UInt16]32)
$w.Write([UInt32]$pngBytes.Length); $w.Write([UInt32]22)
$w.Write($pngBytes)
[System.IO.File]::WriteAllBytes('${iconIco.replace(/\\/g, '\\\\')}', $ms.ToArray())
$w.Dispose(); $ms.Dispose()
`.trim();

  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    stdio: 'inherit',
    shell: false,
  });
  if (r.status !== 0) {
    console.error('[build-desktop-pet] icon.ico generation failed');
    process.exit(r.status || 1);
  }
  console.log(`[build-desktop-pet] Wrote ${iconIco}`);
}

ensureIconIco();

if (process.platform !== 'win32') {
  console.warn(
    `[build-desktop-pet] Note: v1 only ships Windows binaries. ` +
      `You're on ${process.platform}. Build will still run, but the ` +
      `extension currently only spawns the sidecar on Windows.`
  );
}

console.log('[build-desktop-pet] Running cargo build --release in', sidecarDir);
const result = spawnSync('cargo', ['build', '--release'], {
  cwd: sidecarDir,
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.error('[build-desktop-pet] cargo build failed (exit code', result.status, ')');
  console.error('Common causes:');
  console.error('  - Rust toolchain not installed: https://rustup.rs');
  console.error('  - Missing Tauri prerequisites: https://v2.tauri.app/start/prerequisites/');
  console.error('  - On Windows: Microsoft C++ build tools missing');
  process.exit(result.status || 1);
}

const exeName = process.platform === 'win32' ? 'anime-companion-pet.exe' : 'anime-companion-pet';
const outputPath = path.join(sidecarDir, 'target', 'release', exeName);
if (fs.existsSync(outputPath)) {
  const stats = fs.statSync(outputPath);
  const mb = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`[build-desktop-pet] Built ${outputPath} (${mb} MB)`);
} else {
  console.warn('[build-desktop-pet] Cargo reported success but binary missing:', outputPath);
}

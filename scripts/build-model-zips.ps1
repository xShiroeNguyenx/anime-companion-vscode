#!/usr/bin/env pwsh
# Build per-model zip archives for upload to a GitHub Release tag.
#
# Output: dist-models/{folder}.zip — each zip contains the model's files at
# top level (matching the layout ModelDownloader expects).
#
# Usage:
#   pwsh scripts/build-model-zips.ps1
# Then upload all .zip files in dist-models/ as assets on the GitHub Release
# tag named in `animeCompanion.modelDownloadBaseUrl` (default: models-v1).

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repoRoot 'media\live2d'
$out = Join-Path $repoRoot 'dist-models'
New-Item -ItemType Directory -Force -Path $out | Out-Null

# Mirrors MODEL_MAP[*].folder for built-in bundled=false entries in src/models.ts.
# Only safe sample models remain in the default distribution flow.
$models = @(
  'Haru', 'Mao', 'Miara'
)

foreach ($m in $models) {
  $srcDir = Join-Path $src $m
  if (-not (Test-Path $srcDir)) {
    Write-Warning "Skipping missing folder: $srcDir"
    continue
  }
  $zipPath = Join-Path $out "$m.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Write-Output "Zipping $m -> $zipPath"
  Compress-Archive -Path "$srcDir\*" -DestinationPath $zipPath -CompressionLevel Optimal
}

Write-Output ''
Write-Output 'Done. Zip sizes:'
Get-ChildItem $out -Filter '*.zip' |
  Sort-Object Name |
  ForEach-Object {
    $sizeMb = [math]::Round($_.Length / 1MB, 2)
    Write-Output ("  {0,-15} {1} MB" -f $_.Name, $sizeMb)
  }

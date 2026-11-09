<#
.SYNOPSIS
  GPU use while the companion runs, for docs/PERFORMANCE_PLAN.md sections 10-11.

.DESCRIPTION
  Samples Windows' own GPU counters (the ones Task Manager shows) once a second
  and splits the 3D engine's use by who asked for it:
    - VS Code: its GPU process draws every VS Code window and webview, so all
      open windows land on this one line;
    - desktop pet: anime-companion-pet.exe and its WebView2 processes;
    - dwm: Windows composing the screen;
    - other apps, with the busiest named, so a reading spoiled by a game or a
      video can be told apart.
  Also prints the GPU memory of the VS Code GPU process and of the pet.

  With an integrated GPU near full, Windows inflates each process's share, so
  compare readings taken under the same conditions, not against other machines.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/measure-gpu.ps1 -Seconds 30 -Label "4 windows, 1 focused, minute 2"
#>
param(
  [int]$Seconds = 30,
  [string]$Label = ''
)
$ErrorActionPreference = 'Stop'

function Get-ProcessTable {
  $table = @{}
  foreach ($p in Get-CimInstance Win32_Process) { $table[[int]$p.ProcessId] = $p }
  return $table
}

# Who a process works for: walks up the parents, for WebView2 helpers.
function Get-Role([int]$processId, $table) {
  $p = $table[$processId]
  if (-not $p) { return 'other' }
  if ($p.Name -eq 'Code.exe') {
    if ($p.CommandLine -match '--type=gpu-process') { return 'vscode' }
    return 'vscode-other'
  }
  if ($p.Name -eq 'dwm.exe') { return 'dwm' }
  $q = $p
  for ($i = 0; $i -lt 5 -and $q; $i++) {
    if ($q.Name -like 'anime-companion-pet*') { return 'pet' }
    $q = $table[[int]$q.ParentProcessId]
  }
  return 'other'
}

# The app a process belongs to, for naming the other busy ones.
function Get-AppName([int]$processId, $table) {
  $p = $table[$processId]
  if (-not $p) { return "pid $processId" }
  $q = $p
  for ($i = 0; $i -lt 5 -and $q; $i++) {
    if ($q.Name -notmatch '^(msedgewebview2|chrome|msedge|svchost|explorer)\.exe$') { return $q.Name }
    $parent = $table[[int]$q.ParentProcessId]
    if (-not $parent -or $parent.Name -eq 'explorer.exe') { return $q.Name }
    $q = $parent
  }
  return $p.Name
}

$table = Get-ProcessTable
$codeHosts = @($table.Values | Where-Object { $_.Name -eq 'Code.exe' -and $_.CommandLine -match 'node\.mojom\.NodeService' -and $_.CommandLine -match '--inspect-port' }).Count
$pets = @($table.Values | Where-Object { $_.Name -like 'anime-companion-pet*' }).Count

Write-Host ("Sampling the GPU for {0} s{1}..." -f $Seconds, $(if ($Label) { " ($Label)" } else { '' }))
try {
  $sets = Get-Counter -Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -SampleInterval 1 -MaxSamples $Seconds
} catch {
  Write-Error "Could not read the GPU counters ($_). They need Windows 10 1709 or later, and English counter names."
  exit 1
}

$sums = @{ vscode = 0.0; 'vscode-other' = 0.0; pet = 0.0; dwm = 0.0; other = 0.0 }
$byApp = @{}
$table = Get-ProcessTable
foreach ($set in $sets) {
  foreach ($c in $set.CounterSamples) {
    if ($c.InstanceName -notmatch '^pid_(\d+)_') { continue }
    $id = [int]$matches[1]
    $role = Get-Role $id $table
    $sums[$role] += $c.CookedValue
    if ($role -eq 'other' -and $c.CookedValue -gt 0) {
      $app = Get-AppName $id $table
      $byApp[$app] = [double]$byApp[$app] + $c.CookedValue
    }
  }
}
$n = [Math]::Max(1, $sets.Count)
$avg = @{}
foreach ($k in $sums.Keys) { $avg[$k] = $sums[$k] / $n }
$total = ($avg.Values | Measure-Object -Sum).Sum

# GPU memory right now, per process: shared (integrated GPUs) and dedicated.
function Get-GpuMemoryMB([string]$role) {
  $shared = 0.0; $dedicated = 0.0
  foreach ($counter in @('Shared Usage', 'Dedicated Usage')) {
    $set = Get-Counter -Counter "\GPU Process Memory(*)\$counter" -MaxSamples 1
    foreach ($c in $set.CounterSamples) {
      if ($c.InstanceName -notmatch '^pid_(\d+)_') { continue }
      if ((Get-Role ([int]$matches[1]) $table) -ne $role) { continue }
      if ($counter -eq 'Shared Usage') { $shared += $c.CookedValue } else { $dedicated += $c.CookedValue }
    }
  }
  return @{ shared = [Math]::Round($shared / 1MB); dedicated = [Math]::Round($dedicated / 1MB) }
}
$codeMem = Get-GpuMemoryMB 'vscode'
$petMem = Get-GpuMemoryMB 'pet'

Write-Host ''
Write-Host ("VS Code windows (extension hosts): {0}    desktop pet processes: {1}" -f $codeHosts, $pets)
Write-Host 'GPU 3D, average over the run:'
Write-Host ("  total              {0,6:N1} %" -f $total)
Write-Host ("  VS Code            {0,6:N1} %   (its GPU process: every window and webview)" -f $avg['vscode'])
Write-Host ("  desktop pet        {0,6:N1} %" -f $avg['pet'])
Write-Host ("  Windows (dwm)      {0,6:N1} %" -f $avg['dwm'])
Write-Host ("  other apps         {0,6:N1} %" -f ($avg['other'] + $avg['vscode-other']))
$busy = $byApp.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 3 | Where-Object { $_.Value / $n -ge 1 }
foreach ($b in $busy) { Write-Host ("      {0,-22} {1,6:N1} %" -f $b.Key, ($b.Value / $n)) }
Write-Host 'GPU memory now:'
Write-Host ("  VS Code            shared {0} MB, dedicated {1} MB" -f $codeMem.shared, $codeMem.dedicated)
if ($pets) { Write-Host ("  desktop pet        shared {0} MB, dedicated {1} MB" -f $petMem.shared, $petMem.dedicated) }
Write-Host ''
Write-Host 'Row for section 11 (| situation | GPU 3D VS Code | GPU memory VS Code |):'
Write-Host ("| {0} | {1:N1} % (total {2:N1} %) | {3} MB |" -f $(if ($Label) { $Label } else { '?' }), $avg['vscode'], $total, ($codeMem.shared + $codeMem.dedicated))

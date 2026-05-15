#!/usr/bin/env pwsh
# Static checks: typecheck + lint + build for dashboard and extension.
# Exits non-zero if any step fails.

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

$results = @()

function Run-Step {
    param([string]$name, [string]$cmd)
    Write-Host ""
    Write-Host "=== $name ===" -ForegroundColor Cyan
    Write-Host "> $cmd"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Invoke-Expression $cmd
    $code = $LASTEXITCODE
    $sw.Stop()
    $secs = [int]$sw.Elapsed.TotalSeconds
    $status = if ($code -eq 0) { 'PASS' } else { 'FAIL' }
    $script:results += [pscustomobject]@{ Step = $name; Status = $status; Code = $code; Seconds = $secs }
    if ($code -ne 0) { Write-Host "$name FAILED (exit $code)" -ForegroundColor Red }
}

# Dashboard
Run-Step 'dashboard:typecheck' 'pnpm --filter dashboard exec tsc --noEmit'
Run-Step 'dashboard:lint'      'pnpm --filter dashboard run lint'
Run-Step 'dashboard:build'     'pnpm --filter dashboard run build'

# Extension
Run-Step 'extension:typecheck' 'pnpm --filter extension exec tsc --noEmit'
Run-Step 'extension:build'     'pnpm --filter extension run build'

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize

$failed = $results | Where-Object Status -eq 'FAIL'
if ($failed) {
    Write-Host "STATIC CHECKS FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "STATIC CHECKS PASSED" -ForegroundColor Green
exit 0

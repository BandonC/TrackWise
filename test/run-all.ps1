#!/usr/bin/env pwsh
# Wrapper: static checks then E2E.

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path "$PSScriptRoot/..").Path
Set-Location $root

& pwsh -File "$PSScriptRoot/static.ps1"
$staticCode = $LASTEXITCODE

Write-Host ""
Write-Host "=== E2E ===" -ForegroundColor Cyan
node "$PSScriptRoot/e2e.mjs"
$e2eCode = $LASTEXITCODE

Write-Host ""
Write-Host "=== Overall ===" -ForegroundColor Cyan
Write-Host "static: exit $staticCode"
Write-Host "e2e:    exit $e2eCode"

if ($staticCode -ne 0 -or $e2eCode -ne 0) { exit 1 }
exit 0

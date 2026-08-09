# GSD Workflow Validation Script
# Validates all workflow files for required structure

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorCount = 0
$WarningCount = 0
$WorkflowsChecked = 0

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " GSD -> VALIDATING WORKFLOWS" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$WorkflowFiles = Get-ChildItem -Path "$PSScriptRoot\..\.agent\workflows\*.md"

foreach ($file in $WorkflowFiles) {
    $WorkflowsChecked++
    $content = Get-Content $file.FullName -Raw

    Write-Host "Checking $($file.Name)..." -NoNewline

    $hasRole = $content -match '<role>'
    $hasProcess = $content -match '<process>'
    $hasObjective = $content -match '<objective>'

    if ($hasRole -and $hasProcess -and $hasObjective) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        if (-not $hasRole) { Write-Host "  - Missing <role> tag" -ForegroundColor Red }
        if (-not $hasProcess) { Write-Host "  - Missing <process> tag" -ForegroundColor Red }
        if (-not $hasObjective) { Write-Host "  - Missing <objective> tag" -ForegroundColor Red }
        $ErrorCount++
    }
}

Write-Host ""
Write-Host "Checked $WorkflowsChecked workflows: $ErrorCount errors, $WarningCount warnings"

if ($ErrorCount -gt 0) {
    exit 1
} else {
    exit 0
}

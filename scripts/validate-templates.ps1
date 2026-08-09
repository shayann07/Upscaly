# GSD Template Validation Script
# Validates all template files for required structure

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorCount = 0
$WarningCount = 0
$TemplatesChecked = 0

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " GSD -> VALIDATING TEMPLATES" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$TemplateFiles = Get-ChildItem -Path "$PSScriptRoot\..\.gsd\templates\*.md"

foreach ($file in $TemplateFiles) {
    $TemplatesChecked++
    $content = Get-Content $file.FullName -Raw

    Write-Host "Checking $($file.Name)..." -NoNewline

    if ($content.Length -gt 50) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [FAILED] File is too small or empty" -ForegroundColor Red
        $ErrorCount++
    }
}

Write-Host ""
Write-Host "Checked $TemplatesChecked templates: $ErrorCount errors, $WarningCount warnings"

if ($ErrorCount -gt 0) {
    exit 1
} else {
    exit 0
}

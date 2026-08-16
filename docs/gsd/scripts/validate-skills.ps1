# GSD Skill Validation Script
# Validates all skill files for required structure

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorCount = 0
$WarningCount = 0
$SkillsChecked = 0

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " GSD -> VALIDATING SKILLS" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$SkillFiles = Get-ChildItem -Path "$PSScriptRoot\..\.agents\skills\*\SKILL.md"

foreach ($file in $SkillFiles) {
    $SkillsChecked++
    $skillName = $file.Directory.Name
    $content = Get-Content $file.FullName -Raw

    Write-Host "Checking $skillName..." -NoNewline

    $hasFrontmatter = $content -match '^---'
    $hasRole = $content -match '<role>'

    if ($hasFrontmatter -and $hasRole) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        if (-not $hasFrontmatter) { Write-Host "  - Missing YAML frontmatter" -ForegroundColor Red }
        if (-not $hasRole) { Write-Host "  - Missing <role> tag" -ForegroundColor Red }
        $ErrorCount++
    }
}

Write-Host ""
Write-Host "Checked $SkillsChecked skills: $ErrorCount errors, $WarningCount warnings"

if ($ErrorCount -gt 0) {
    exit 1
} else {
    exit 0
}

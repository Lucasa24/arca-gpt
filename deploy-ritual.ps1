$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path

Write-Output ""
Write-Output "ARCA • DEPLOY RITUAL"
Write-Output "Local: $repo"
Write-Output ""

git status

$hasChanges = $true
git diff --quiet
if ($LASTEXITCODE -eq 0) { $hasChanges = $false } else { $hasChanges = $true }

if ($hasChanges) {
  git add -A
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  git commit -m "Ritual deploy: $stamp"
} else {
  Write-Output ""
  Write-Output "Sem mudanças locais para commitar."
}

git pull --rebase origin main
git push origin main

Write-Output ""
Write-Output "Selo aplicado: main empurrada para origin."

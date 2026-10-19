# Collects the files to upload to the AI tutor project's knowledge into tutor/knowledge/.
# Each file is renamed from its repository path by replacing "/" with "__"
# (e.g. docs/Day1_xxx.md -> docs__Day1_xxx.md), which is the naming the tutor instructions expect.
# Usage (from the repository root):
#   powershell -ExecutionPolicy Bypass -File tutor\build-knowledge.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'knowledge'

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path $out | Out-Null

$files = @()
$files += Get-Item (Join-Path $root 'README.md')
$files += Get-ChildItem (Join-Path $root 'docs') -File -Filter '*.md'
$files += Get-ChildItem (Join-Path $root 'docs\worksheets') -File -Filter '*.md'
$files += Get-ChildItem (Join-Path $root 'tutor\guide') -File -Filter '*.md'
$files += Get-ChildItem (Join-Path $root 'hands-on') -File -Recurse

# Extensions that the project knowledge may not accept are uploaded as .txt
$asText = @('.yml', '.yaml', '.sh')

foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length + 1)
    $name = $rel -replace '[\\/]', '__'
    if ($asText -contains $f.Extension) { $name = "$name.txt" }
    Copy-Item $f.FullName (Join-Path $out $name)
}

$count = (Get-ChildItem $out -File).Count
Write-Host "$count files -> $out"

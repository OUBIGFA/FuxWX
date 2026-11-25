# Prepare a project-local toolchain from official fixed releases.
param([string]$Downloader)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$downloads = Join-Path $projectRoot '.local/downloads'
$aria = $Downloader
if (-not $aria) { $aria = (Get-Command aria2-next -ErrorAction Stop).Source }
New-Item -ItemType Directory -Force -Path $downloads | Out-Null
function Fetch([string]$name, [string]$url) {
    $target = Join-Path $downloads $name
    if (-not (Test-Path -LiteralPath $target)) {
        & $aria -d $downloads -o $name --auto-file-renaming=false -c $url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $name" }
    }
    return $target
}
function Checksum([string]$file, [string]$sum) {
    $expected = (Get-Content -LiteralPath $sum).Split(' ')[0]
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw "SHA-256 mismatch: $file" }
}
$nshZip = Fetch 'nsh-windows-x86_64-0.7.0.zip' 'https://github.com/longbridge/nsh/releases/download/v0.7.0/nsh-windows-x86_64.zip'
$nshSum = Fetch 'nsh-windows-x86_64-0.7.0.zip.sha256' 'https://github.com/longbridge/nsh/releases/download/v0.7.0/nsh-windows-x86_64.zip.sha256'
Checksum $nshZip $nshSum
$nshDir = Join-Path $projectRoot '.local/toolchains/nsh-0.7.0'
if (-not (Test-Path -LiteralPath (Join-Path $nshDir 'nsh/bin/nsh.exe'))) { Expand-Archive -LiteralPath $nshZip -DestinationPath $nshDir }
$rustup = Fetch 'rustup-init.exe' 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
$rustupSum = Fetch 'rustup-init.exe.sha256' 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe.sha256'
Checksum $rustup $rustupSum
. (Join-Path $PSScriptRoot 'env.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $env:CARGO_HOME 'bin/cargo.exe'))) {
    & $rustup -y --no-modify-path --profile minimal --default-toolchain '1.100.0'
    if ($LASTEXITCODE -ne 0) { throw 'Rust installation failed' }
}
& rustup toolchain install '1.100.0' --profile minimal --component rustfmt
if ($LASTEXITCODE -ne 0) { throw 'Rust toolchain setup failed' }
$env:RUSTUP_TOOLCHAIN = '1.100.0'
& rustc --version
& nsh --version
python -m pip install --target (Join-Path $projectRoot '.local/python') -r (Join-Path $projectRoot 'requirements-dev.txt')
if ($LASTEXITCODE -ne 0) { throw 'Development dependency setup failed' }

# Scope the toolchain and caches to this project; do not change the user PATH.
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:CARGO_HOME = Join-Path $projectRoot '.local/toolchains/cargo'
$env:RUSTUP_HOME = Join-Path $projectRoot '.local/toolchains/rustup'
$env:CARGO_TARGET_DIR = Join-Path $projectRoot '.local/build/rust'
$env:NSH_HOME = Join-Path $projectRoot '.local/nsh'
$env:PYTHONUTF8 = '1'
$env:PYTHONPATH = Join-Path $projectRoot '.local/python'
$env:CARGO_BUILD_JOBS = '8'
$env:RUSTUP_TOOLCHAIN = '1.100.0'
$env:TEMP = Join-Path $projectRoot '_temp/build'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$env:PATH = (Join-Path $projectRoot '.local/toolchains/nsh-0.7.1/nsh/bin') + ';' + (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
$inno = Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6'
if (Test-Path -LiteralPath (Join-Path $inno 'ISCC.exe')) { $env:PATH = $inno + ';' + $env:PATH }

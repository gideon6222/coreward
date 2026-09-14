<#
.SYNOPSIS
  Build the Android wrapper of this web game (a Trusted Web Activity) as a signed bundle
  for Google Play, and put it on a GitHub release so the dashboard's store lane can carry
  it up. One command, no prompts.

.DESCRIPTION
  twa\twa-manifest.json is the source: package com.gideon.lattice, the Pages URL as the
  start URL, the upload keystore in C:\dev\keys. Bubblewrap regenerates the Android
  project from it (`update`), builds the bundle (`build`), and this script tags the commit
  and attaches the .aab to a release named v<version>, where the version is the newest
  entry in src\changelog.ts. The store lane sees a v* release with a bundle and uploads it
  to internal testing on its own.

  What a TWA needs that a Godot game does not: the site must serve
  .well-known\assetlinks.json naming the SHA-256 of the certificate that signs the
  installed APK. With Play App Signing that is GOOGLE's app-signing certificate, which only
  exists after the app is created in Play Console (Setup, App signing). Until it is in
  public\.well-known\assetlinks.json, the wrapper runs but shows a browser bar at the top.
  The upload key's fingerprint is added too, for a build installed straight from here.

  Needs: node, Bubblewrap (`npm i -g @bubblewrap/cli`), the JDK and SDK named in
  ~\.bubblewrap\config.json, and the upload key password in the environment as
  BUBBLEWRAP_KEYSTORE_PASSWORD (read from C:\dev\keys\UPLOAD-KEY-README.txt if absent,
  which is where the studio keeps it until it moves to a password manager).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\twa.ps1
  powershell -ExecutionPolicy Bypass -File scripts\twa.ps1 -NoRelease     # build only
#>
[CmdletBinding()]
param(
  [switch] $NoRelease,
  [string] $Keys = 'C:\dev\keys'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$twa = Join-Path $root 'twa'
$manifest = Join-Path $twa 'twa-manifest.json'
if (-not (Test-Path $manifest)) { throw "no twa\twa-manifest.json" }
$bubblewrap = (Get-Command bubblewrap -ErrorAction SilentlyContinue)
if (-not $bubblewrap) { throw "bubblewrap is not on PATH: npm i -g @bubblewrap/cli" }

# The version is the changelog's, the same source the site shows (INDEX.md rule 10).
$cl = Get-Content (Join-Path $root 'src\changelog.ts') -Raw
if ($cl -notmatch "version:\s*'([^']+)'") { throw "no version in src\changelog.ts" }
$version = $Matches[1]
$m = Get-Content $manifest -Raw | ConvertFrom-Json
$code = [int]$m.appVersionCode
if ($m.appVersionName -ne $version) {
  # A new version name means a new, higher version code: Play refuses a repeat.
  $code = $code + 1
}
$m.appVersionName = $version; $m.appVersion = $version; $m.appVersionCode = $code
[System.IO.File]::WriteAllText($manifest, (ConvertTo-Json -InputObject $m -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "wrapper $version, version code $code"

if (-not $env:BUBBLEWRAP_KEYSTORE_PASSWORD) {
  $readme = Join-Path $Keys 'UPLOAD-KEY-README.txt'
  if (Test-Path $readme) {
    $line = @(Get-Content $readme | Where-Object { $_ -match '^\s*password\s*:\s*\S' })[0]
    if ($line -match '^\s*password\s*:\s*(\S+)') { $env:BUBBLEWRAP_KEYSTORE_PASSWORD = $Matches[1] }
  }
}
if (-not $env:BUBBLEWRAP_KEYSTORE_PASSWORD) { throw "set BUBBLEWRAP_KEYSTORE_PASSWORD (the upload key password)" }
$env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD

Push-Location $twa
try {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  # Bubblewrap runs a bare `gradlew.bat` through cmd, which only finds it in the working
  # directory when NoDefaultCurrentDirectoryInExePath is unset. Some shells set it (Git
  # Bash does), so the project folder goes on PATH for the length of this script.
  $env:Path = "$twa;$env:Path"
  # update regenerates the Android project from the manifest (fetching the icon from the
  # live site); build compiles and signs. --skipPwaValidation: the validation wants Lighthouse
  # and a Chrome, and the site is already known to be a PWA.
  & bubblewrap update --skipVersionUpgrade 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 5
  if ($LASTEXITCODE -ne 0) { throw "bubblewrap update failed" }
  & bubblewrap build --skipPwaValidation 2>&1 | ForEach-Object { "$_" } | Select-Object -Last 8
  if ($LASTEXITCODE -ne 0) { throw "bubblewrap build failed" }
  $ErrorActionPreference = $prev
} finally { Pop-Location }
$aab = Join-Path $twa 'app-release-bundle.aab'
if (-not (Test-Path $aab)) { throw "no bundle at $aab" }
$size = (Get-Item $aab).Length
if ($size -lt 500000) { throw "bundle is $size bytes, which is not a real wrapper" }
$out = Join-Path $root 'build'; New-Item -ItemType Directory -Force -Path $out | Out-Null
$final = Join-Path $out 'lattice.aab'
Copy-Item $aab $final -Force
& "$env:JAVA_HOME\bin\jarsigner.exe" -verify $final 2>$null | Out-Null
Write-Host "bundle: $final ($size bytes)"
if ($NoRelease) { exit 0 }

# The release the store lane reads: tag v<version> on HEAD, the bundle attached.
$tag = "v$version"
Push-Location $root
try {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $exists = @(& gh release view $tag --json tagName 2>$null)
  if ($exists) {
    & gh release upload $tag $final --clobber 2>&1 | Out-Null
  } else {
    & git tag -a $tag -m "${tag}: Android wrapper for Google Play" 2>&1 | Out-Null
    & git push -q origin $tag 2>&1 | Out-Null
    & gh release create $tag $final --title "$tag" --notes "The Android wrapper (Trusted Web Activity) of The Lattice, version $version, version code $code. Built by scripts\twa.ps1 from twa\twa-manifest.json." 2>&1 | Out-Null
  }
  $ErrorActionPreference = $prev
} finally { Pop-Location }
Write-Host "release $tag carries lattice.aab"

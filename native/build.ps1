param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root "native"
$build = Join-Path $root "build"
$sdkVersion = "1.0.2903.40"
$sdkDir = Join-Path $env:TEMP "webview2-sdk-$sdkVersion"
$nuget = Join-Path $env:TEMP "webview2-$sdkVersion.nupkg"

if (-not (Test-Path (Join-Path $sdkDir "lib\net462\Microsoft.Web.WebView2.Core.dll"))) {
    Write-Host "Downloading Microsoft.Web.WebView2 $sdkVersion ..."
    Invoke-WebRequest -Uri "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$sdkVersion" -OutFile $nuget
    if (Test-Path $sdkDir) { Remove-Item $sdkDir -Recurse -Force }
    Expand-Archive -Path $nuget -DestinationPath $sdkDir -Force
}

$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { throw "找不到 csc.exe" }

$core = Join-Path $sdkDir "lib\net462\Microsoft.Web.WebView2.Core.dll"
$winforms = Join-Path $sdkDir "lib\net462\Microsoft.Web.WebView2.WinForms.dll"
$loader = Join-Path $sdkDir "runtimes\win-x64\native\WebView2Loader.dll"
$icon = Join-Path $build "icon.ico"

& $csc /nologo /target:winexe /platform:x64 "/win32icon:$icon" `
    "/out:$native\MinesweeperNoGuess.exe" `
    "/r:$core" "/r:$winforms" /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    "/resource:$root\index.html" "/resource:$root\style.css" "/resource:$root\game.js" `
    "/resource:$core,Microsoft.Web.WebView2.Core.dll" `
    "/resource:$winforms,Microsoft.Web.WebView2.WinForms.dll" `
    "/resource:$loader" `
    (Join-Path $native "app.cs")

Write-Host "Built $native\MinesweeperNoGuess.exe"

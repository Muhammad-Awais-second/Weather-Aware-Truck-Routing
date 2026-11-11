$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$dataDir = "C:\tmp\chrome_screen_test"

if (Test-Path $dataDir) {
    Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$proc = Start-Process -FilePath $chromePath -ArgumentList "--headless=new", "--remote-debugging-port=9222", "--remote-allow-origins=*", "--user-data-dir=$dataDir", "--window-size=1440,900" -PassThru

Start-Sleep -Seconds 3

try {
    node capture.cjs
} finally {
    if ($proc -and !$proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}

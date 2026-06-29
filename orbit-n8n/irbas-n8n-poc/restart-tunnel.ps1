# Restart the Cloudflare quick tunnel and print the new Slack Request URL.
# Run from the irbas-n8n-poc folder:  .\restart-tunnel.ps1
$tools = Join-Path $PSScriptRoot "tools"
$exe   = Join-Path $tools "cloudflared.exe"
$log   = Join-Path $tools "cloudflared.log"

Write-Host "Stopping any running cloudflared..." -ForegroundColor Yellow
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $log -Force -ErrorAction SilentlyContinue

Write-Host "Starting tunnel (detached)..." -ForegroundColor Yellow
Start-Process -FilePath $exe `
  -ArgumentList 'tunnel','--url','http://localhost:5678','--no-autoupdate' `
  -RedirectStandardError $log -WindowStyle Hidden

Start-Sleep -Seconds 10
$url = (Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1).Matches.Value

if (-not $url) { Write-Host "Tunnel URL not found yet; check $log" -ForegroundColor Red; exit 1 }

$url | Out-File -FilePath (Join-Path $tools "tunnel_url.txt") -Encoding ascii -NoNewline

# Update WEBHOOK_URL in .env
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
  $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^WEBHOOK_URL=' }
  $lines + "WEBHOOK_URL=$url" | Set-Content $envFile -Encoding ascii
}

Write-Host ""
Write-Host "Tunnel is up:" -ForegroundColor Green
Write-Host "  $url"
Write-Host ""
Write-Host "Paste this into Slack -> your app -> Event Subscriptions -> Request URL:" -ForegroundColor Cyan
Write-Host "  $url/webhook/slack-incoming/webhook"

# Fire one of the predefined mock WhatsApp scenarios.
# Usage:  .\mock-data\send_scenario.ps1 <1-7>
#         .\mock-data\send_scenario.ps1        (shows the menu)
param([int]$Scenario = 0)

$token = if ($env:WHATSAPP_VERIFY_TOKEN) { $env:WHATSAPP_VERIFY_TOKEN } else { "test_token_123" }
$url = "http://localhost:5678/webhook/whatsapp-incoming?token=$token"

# id -> group, sender, message text
$scenarios = @{
  1 = @{ group = "group_karachi_001";   from = "+923001234567"; text = "Sir HBL account me 250,000 transfer kar diye hain D.Watson ke against, reference TX99231" }
  2 = @{ group = "group_lahore_001";    from = "+923009876543"; text = "Payment ho gayi 3.5 lac ki Al-Fatah wali, slip 2024-5567" }
  3 = @{ group = "group_islamabad_001"; from = "+923005551111"; text = "Cash deposit karwaya bank me 120,000, deposit slip number 88123" }
  4 = @{ group = "group_karachi_001";   from = "+923002223344"; text = "Gaari ka petrol dalwaya 8,500 ka office ke kaam ke liye, receipt bhej raha hoon" }
  5 = @{ group = "group_lahore_001";    from = "+923007778899"; text = "Office ka bijli ka bill jama karwaya 42,300 rupay" }
  6 = @{ group = "group_islamabad_001"; from = "+923005556666"; text = "Assalam o alaikum sir, kal meeting kitne baje hai?" }
  7 = @{ group = "group_karachi_001";   from = "+923001234567"; text = "Sir payment kar di hai D.Watson wali, amount baad me batata hoon" }
}

if ($Scenario -lt 1 -or $Scenario -gt 7) {
  Write-Host "Usage: .\send_scenario.ps1 <1-7>`n"
  foreach ($k in ($scenarios.Keys | Sort-Object)) {
    Write-Host ("  {0}) [{1}] {2}" -f $k, $scenarios[$k].group, $scenarios[$k].text)
  }
  exit 0
}

$s = $scenarios[$Scenario]
$body = @{
  body = @{
    entry = @(@{
      changes = @(@{
        value = @{
          metadata = @{ display_phone_number = $s.group }
          messages = @(@{
            from = $s.from
            text = @{ body = $s.text }
            timestamp = [string][int][double]::Parse((Get-Date -UFormat %s))
          })
        }
      })
    })
  }
} | ConvertTo-Json -Depth 10

Write-Host "Sending scenario #$Scenario  [$($s.group)]:" -ForegroundColor Cyan
Write-Host "  `"$($s.text)`"`n"
$resp = Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body $body
Write-Host "Webhook response: $($resp | ConvertTo-Json -Compress)"
Write-Host "Check the n8n Executions tab or the approval UI in a few seconds." -ForegroundColor Green

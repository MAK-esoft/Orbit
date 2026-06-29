# Windows PowerShell equivalent of send_unknown.sh
# Simulates: an unrecognised message (office closed announcement).
$token = if ($env:WHATSAPP_VERIFY_TOKEN) { $env:WHATSAPP_VERIFY_TOKEN } else { "test_token_123" }
$body = @{
  body = @{
    entry = @(@{
      changes = @(@{
        value = @{
          metadata = @{ display_phone_number = "group_islamabad_001" }
          messages = @(@{
            from = "+923005556666"
            text = @{ body = "Kal office band rahega Eid ki wajah se" }
            timestamp = [string][int][double]::Parse((Get-Date -UFormat %s))
          })
        }
      })
    })
  }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "http://localhost:5678/webhook/whatsapp-incoming?token=$token" -ContentType "application/json" -Body $body

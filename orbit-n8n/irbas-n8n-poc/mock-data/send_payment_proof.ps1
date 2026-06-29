# Windows PowerShell equivalent of send_payment_proof.sh
# Simulates: RO Karachi accountant sends a payment proof message.
$token = if ($env:WHATSAPP_VERIFY_TOKEN) { $env:WHATSAPP_VERIFY_TOKEN } else { "test_token_123" }
$body = @{
  body = @{
    entry = @(@{
      changes = @(@{
        value = @{
          metadata = @{ display_phone_number = "group_karachi_001" }
          messages = @(@{
            from = "+923001234567"
            text = @{ body = "Sir payment kar di 450,000 D.Watson wali, slip number 2024-1847" }
            timestamp = [string][int][double]::Parse((Get-Date -UFormat %s))
          })
        }
      })
    })
  }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "http://localhost:5678/webhook/whatsapp-incoming?token=$token" -ContentType "application/json" -Body $body

# Windows PowerShell equivalent of send_expense_proof.sh
# Simulates: RO Lahore accountant sends an AC repair expense.
$token = if ($env:WHATSAPP_VERIFY_TOKEN) { $env:WHATSAPP_VERIFY_TOKEN } else { "test_token_123" }
$body = @{
  body = @{
    entry = @(@{
      changes = @(@{
        value = @{
          metadata = @{ display_phone_number = "group_lahore_001" }
          messages = @(@{
            from = "+923009876543"
            text = @{ body = "AC repair karwa di office ki, 35,000 lage hain, receipt attach hai" }
            timestamp = [string][int][double]::Parse((Get-Date -UFormat %s))
          })
        }
      })
    })
  }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Post -Uri "http://localhost:5678/webhook/whatsapp-incoming?token=$token" -ContentType "application/json" -Body $body

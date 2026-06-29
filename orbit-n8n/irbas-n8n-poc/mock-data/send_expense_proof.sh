#!/bin/bash
# Simulates: RO Lahore accountant sends an AC repair expense
# Expected: classified expense_proof -> creates a pending expense_request.

curl -X POST "http://localhost:5678/webhook/whatsapp-incoming?token=${WHATSAPP_VERIFY_TOKEN:-test_token_123}" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "entry": [{
        "changes": [{
          "value": {
            "metadata": { "display_phone_number": "group_lahore_001" },
            "messages": [{
              "from": "+923009876543",
              "text": { "body": "AC repair karwa di office ki, 35,000 lage hain, receipt attach hai" },
              "timestamp": "'"$(date +%s)"'"
            }]
          }
        }]
      }]
    }
  }'
echo ""

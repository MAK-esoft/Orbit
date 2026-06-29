#!/bin/bash
# Simulates: RO Karachi accountant sends a payment proof message
# "Sir payment kar di 450,000 D.Watson wali, slip number 2024-1847"
# Expected: classified payment_proof -> creates a pending payment_request.

curl -X POST "http://localhost:5678/webhook/whatsapp-incoming?token=${WHATSAPP_VERIFY_TOKEN:-test_token_123}" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "entry": [{
        "changes": [{
          "value": {
            "metadata": { "display_phone_number": "group_karachi_001" },
            "messages": [{
              "from": "+923001234567",
              "text": { "body": "Sir payment kar di 450,000 D.Watson wali, slip number 2024-1847" },
              "timestamp": "'"$(date +%s)"'"
            }]
          }
        }]
      }]
    }
  }'
echo ""

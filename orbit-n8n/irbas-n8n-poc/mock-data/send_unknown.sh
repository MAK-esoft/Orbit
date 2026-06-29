#!/bin/bash
# Simulates: an unrecognised message (office closed announcement)
# Expected: classified unrecognised -> message logged only, no request created.

curl -X POST "http://localhost:5678/webhook/whatsapp-incoming?token=${WHATSAPP_VERIFY_TOKEN:-test_token_123}" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "entry": [{
        "changes": [{
          "value": {
            "metadata": { "display_phone_number": "group_islamabad_001" },
            "messages": [{
              "from": "+923005556666",
              "text": { "body": "Kal office band rahega Eid ki wajah se" },
              "timestamp": "'"$(date +%s)"'"
            }]
          }
        }]
      }]
    }
  }'
echo ""

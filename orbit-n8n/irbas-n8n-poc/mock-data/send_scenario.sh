#!/bin/bash
# Fire one of the predefined mock WhatsApp scenarios.
# Usage:  bash mock-data/send_scenario.sh <1-7>
#         bash mock-data/send_scenario.sh        (shows the menu)

TOKEN="${WHATSAPP_VERIFY_TOKEN:-test_token_123}"
URL="http://localhost:5678/webhook/whatsapp-incoming?token=${TOKEN}"
N="$1"

case "$N" in
  1) GROUP="group_karachi_001";   FROM="+923001234567"; TEXT="Sir HBL account me 250,000 transfer kar diye hain D.Watson ke against, reference TX99231" ;;
  2) GROUP="group_lahore_001";    FROM="+923009876543"; TEXT="Payment ho gayi 3.5 lac ki Al-Fatah wali, slip 2024-5567" ;;
  3) GROUP="group_islamabad_001"; FROM="+923005551111"; TEXT="Cash deposit karwaya bank me 120,000, deposit slip number 88123" ;;
  4) GROUP="group_karachi_001";   FROM="+923002223344"; TEXT="Gaari ka petrol dalwaya 8,500 ka office ke kaam ke liye, receipt bhej raha hoon" ;;
  5) GROUP="group_lahore_001";    FROM="+923007778899"; TEXT="Office ka bijli ka bill jama karwaya 42,300 rupay" ;;
  6) GROUP="group_islamabad_001"; FROM="+923005556666"; TEXT="Assalam o alaikum sir, kal meeting kitne baje hai?" ;;
  7) GROUP="group_karachi_001";   FROM="+923001234567"; TEXT="Sir payment kar di hai D.Watson wali, amount baad me batata hoon" ;;
  *)
    echo "Usage: bash send_scenario.sh <1-7>"
    echo "  1) [karachi]   payment, bank transfer, ref TX99231"
    echo "  2) [lahore]    payment, 3.5 lac (=350,000), slip 2024-5567"
    echo "  3) [islamabad] payment, cash deposit, slip 88123"
    echo "  4) [karachi]   expense, petrol 8,500"
    echo "  5) [lahore]    expense, electricity bill 42,300"
    echo "  6) [islamabad] unrecognised (greeting/question)"
    echo "  7) [karachi]   payment with NO amount (edge case)"
    exit 0
    ;;
esac

echo "Sending scenario #$N  [$GROUP]:"
echo "  \"$TEXT\""
echo
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"body":{"entry":[{"changes":[{"value":{"metadata":{"display_phone_number":"'"$GROUP"'"},"messages":[{"from":"'"$FROM"'","text":{"body":"'"$TEXT"'"},"timestamp":"'"$(date +%s)"'"}]}}]}]}}' \
  -w "\nWebhook response above [HTTP %{http_code}]\n"
echo "Check the n8n Executions tab or the approval UI in a few seconds."

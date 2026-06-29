# Mock WhatsApp Test Scenarios

Seven ready-to-run messages that exercise every branch of the workflow, including
edge cases (Pakistani "lac" amounts, cash vs bank transfer, missing amount).

**How to run one** (from the `irbas-n8n-poc` folder):

```powershell
# PowerShell
.\mock-data\send_scenario.ps1 1      # fire scenario #1
```
```bash
# Git Bash
bash mock-data/send_scenario.sh 1    # fire scenario #1
```
Run with no number to see the menu. Each message posts to the live webhook
(`http://localhost:5678/webhook/whatsapp-incoming`) using token `test_token_123`.

> The `group` decides which Regional Office is matched:
> `group_karachi_001` → Karachi RO, `group_lahore_001` → Lahore RO,
> `group_islamabad_001` → Islamabad RO.

| # | Group (RO) | Message | Expected classification | Expected extraction |
|---|------------|---------|------------------------|---------------------|
| 1 | Karachi | `Sir HBL account me 250,000 transfer kar diye hain D.Watson ke against, reference TX99231` | **payment_proof** | amount **250,000**, method ~`bank_transfer`, ref **TX99231** |
| 2 | Lahore | `Payment ho gayi 3.5 lac ki Al-Fatah wali, slip 2024-5567` | **payment_proof** | amount **350,000** (lac→number), slip **2024-5567** |
| 3 | Islamabad | `Cash deposit karwaya bank me 120,000, deposit slip number 88123` | **payment_proof** | amount **120,000**, method ~`cash_deposit`, slip **88123** |
| 4 | Karachi | `Gaari ka petrol dalwaya 8,500 ka office ke kaam ke liye, receipt bhej raha hoon` | **expense_proof** | amount **8,500**, fuel/petrol desc |
| 5 | Lahore | `Office ka bijli ka bill jama karwaya 42,300 rupay` | **expense_proof** | amount **42,300**, utility desc |
| 6 | Islamabad | `Assalam o alaikum sir, kal meeting kitne baje hai?` | **unrecognised** | none (logged only) |
| 7 | Karachi | `Sir payment kar di hai D.Watson wali, amount baad me batata hoon` | **payment_proof** | amount **null** (edge case — request still created) |

**Where to see results**
- n8n → http://localhost:5678 → workflow → **Executions** tab (watch it run node-by-node)
- Approval UI → `approval-ui/index.html` (scenarios 1–5, 7 appear as pending rows)
- Unrecognised (6) only appears in the `whatsapp_messages` table, no request created

> Note: the AI fills `payment_method`/`description` heuristically, so those may vary
> slightly run-to-run. The **classification** and **amount/slip extraction** are the
> reliable signals to check.

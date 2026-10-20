# Execution evidence

All company, buyer, invoice and payment data here is **fictional demo data** (finance-core's "amber" scenario: Hurtownia Techniczna Hydromat Sp. z o.o. and its buyers). No real company data was used. Email addresses end in `.example` and never resolve. **Nothing was sent**: the agent only drafts, and an owner click only records a decision.

## What was run

On 2026-10-20, 14:54:50 to 14:55:41 UTC (22:54 to 22:55 local), one real copilot session was driven through the live API of the running app (Claude API, Supabase log, mock finance-core with the Hydromat profile). The calls, in order:

| # | Call | What happened |
|---|------|---------------|
| 0 | `POST /api/data/reset` | Back to the clean demo company. |
| 1 | `POST /api/agent` "Who owes me money?" | The agent called `get_receivables` and answered from its data: 15.6M PLN owed, 8.3M PLN overdue, Budarol the largest. |
| 2 | `POST /api/agent` "Draft a reminder to Budarol." | The agent called `draft_reminder`; a draft was saved with status `drafted`. |
| 3 | `POST /api/approve` approved | Owner click: the draft became `approved` and the decision was logged. Still not sent. |
| 4 | `POST /api/agent` "Draft a reminder to the buyer with the next largest overdue amount after Budarol." | Draft for Muropol saved as `drafted`. |
| 5 | `POST /api/approve` rejected | Owner click: the draft became `rejected`, logged. |
| 6 | `POST /api/data/extract` with `public/demo-docs/potwierdzenie_przelewu_Budarol_FV-2026-09-0002.pdf` | Claude read the bank confirmation as a payment: Budarol, 138 405,47 PLN, 2026-11-16, FV/2026/09/0002, with its KSeF number. |
| 7 | `POST /api/data/scan` (preview) | "Here's what we found": matched to FV/2026/09/0002. Score 62 to 63, overdue 8 300 492 zł to 8 162 087 zł. Nothing saved. |
| 8 | `POST /api/data/scan` with `confirm: true` | Owner confirmation: payment saved, invoice marked paid, logged. |

## Files

- `execution-log.json`: the `agent_actions` table, exported with `npm run export-log -- --since=2026-10-20T14:54:50.7412451Z`. It holds only this session's 9 rows. Earlier development and test rows exist in the database and are left out by the `--since` filter.
- `session-transcript.json`: the requests and responses of the session above (agent answers, drafts, extraction and scan results), with timestamps.

## What each log entry shows

| Entry | Meaning |
|-------|---------|
| `reset_demo_data` / `logged` | The demo data was reset before the run. |
| `get_receivables` / `logged` | The agent read data (read tier). The payload holds the tool input and the figures it got back. Three calls: one per question that needed receivables. |
| `draft_reminder` / `drafted`, then `approved` or `rejected` | A reminder email the agent wrote (draft tier): recipient, subject, body. The same row changes status when the owner decides, so the final status is the owner's decision. |
| `approval` / `approved` or `rejected` | The owner's click as its own row: which draft, which buyer, which decision (owner-click tier). |
| `document_scan` / `approved` | The owner confirmed "Here's what we found": file name, the matched invoice, and the score, runway and overdue figures before and after. |

The Budarol draft ends `approved`, the Muropol draft ends `rejected`, and no row anywhere means an email was sent.

## Known quirk in this run

In step 2 the agent's answer text contained a stray line ("I need the buyer_id... Call get_receivables first"), and in step 4 it wrongly said it had never saved the Budarol draft. The log is the source of truth: the Budarol `draft_reminder` row exists and was approved. The drafts and figures themselves are correct.

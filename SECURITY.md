# Security

## Permission tiers
| Tier | What | Who triggers it |
| --- | --- | --- |
| Read | Score, receivables, financing pack, affordability forecast | The agent, freely |
| Draft | Reminder e-mail drafts saved as `drafted` | The agent, only when the owner asks, and only if drafts are on in Settings |
| Needs owner click | Approve or reject a draft, share the Passport with banks, request an adviser call | The owner, by a button. Each click is logged |

The AI never sends, pays or moves anything. Approving a reminder records the decision only.

## Controls
- Every tool call and decision is written to `agent_actions`.
- `/api/approve` changes a row only while it is `drafted`, so a decision cannot be repeated or flipped.
- Consent screen lists exactly what banks see. Invoices, buyer e-mails and bank logins are not shared.
- Demo data only. Keys live in `.env.local` and are never committed.

## Known risks
- **Credit intermediation.** Presenting bank offers and passing company data to lenders may count as credit intermediation or brokerage under Polish and EU rules (licensing, disclosures, consumer and SME credit law). Today the offers are fictional demo offers. There is no "Accept offer" button: each offer only leads to "Discuss with an adviser", a callback request to an independent adviser, so Paperbridge never takes or passes on a credit decision. This reduces the risk but does not remove it, because sharing the Passport with lenders still needs the review below. /financing states that offers are indicative and that Paperbridge gives no financial advice. Before real use: legal review, licence or partnership with a licensed intermediary, and clear disclosure of fees and partners.
- **Data sharing.** Sharing financial data with banks needs explicit, revocable consent and GDPR basis. The demo logs consent but has no revoke flow.
- **No authentication.** The demo has a single workspace and no login. Supabase uses the anon key without row-level security.
- **Model errors.** The agent can misread a question. Numbers come from tools, but the wording is generated. Drafts are reviewed by the owner before use.
- **Forecast is a model.** The 13-week forecast is simple and ignores seasonality; payback assumes extra profit. It is not financial advice.
- **In-memory fallback.** Without Supabase the log is lost on restart and not shared between serverless instances.

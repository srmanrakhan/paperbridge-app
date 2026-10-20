# Paperbridge: build brief

## Priorities
1. Agent that acts: chat, drafted reminders, Approve button, action log.
2. Bank financing pack and the /bank view.
3. Dashboard with the score.

- Get every step working end to end before polishing anything.
- Step 6 (KSeF TEST) is optional: do it only if everything else is done.
- Keep the demo company small.

## What it is
AI finance copilot for small Polish B2B companies (hackathon, Topic E "SME Finance Copilot").
It reads e-invoices and bank payments, shows a red-to-green health score, drafts reminders
for late invoices, and builds a bank-ready financing pack. The AI acts, but every action
needs an owner click.

## My scope (Simon)
Database, AI agent, app screens, KSeF TEST link (optional).
NOT mine: finance-core (demo data, score, financing pack). Wojciech builds that as an API.
I call it through lib/financeCore.ts and use mock responses until FINANCE_CORE_URL is set.

## Stack
- One Next.js app (App Router, TypeScript, Tailwind), deployed on Vercel
- Supabase (Postgres)
- Anthropic SDK for the agent (tool use)
- No separate backend: the agent lives in Next.js API routes

## Hard rules
- The AI never sends, pays or moves anything. It only drafts; the owner approves.
- Log every agent tool call and every approval to the agent_actions table.
- Use demo data only. No real company data.
- The live demo must not depend on KSeF TEST being up.
- Keep it simple. Build only what the 3-minute demo needs.
- After each step: explain what you built in plain words, and list how to test it.

## Design direction
In the style of apple.com, one coherent product across all screens.
- System font stack (-apple-system, SF Pro, Segoe UI, Helvetica). No monospace.
- Backgrounds white and #f5f5f7. Text #1d1d1f, secondary #6e6e73.
- One blue accent, #0071e3, for buttons and links only. Status colours (green, amber, red) only for state, always with a label.
- Lots of whitespace, real type scale (large headline numbers, 17px body).
- No borders or only very light hairlines (#e8e8ed). No shadows, no gradients, no emojis.
- Pages: / (Connect KSeF), /dashboard (Overview), /chat (Copilot), /bank (Passport, an A4 document that prints to 1-2 pages), /settings.

## Build steps

### Step 1: Setup
- Create the Next.js project with Supabase client and Anthropic SDK.
- .env.example: SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, FINANCE_CORE_URL
- README.md with setup, run and deploy instructions.

### Step 2: Contract and mock finance-core
- types/sme.ts: TypeScript types for the SME profile (company, buyers, invoices,
  payments). I will paste the agreed JSON; until then, propose a minimal version.
- lib/financeCore.ts with getDemoCompany(), getScore(profile),
  getReceivables(profile), getFinancingPack(profile).
- Mock mode: hard-coded realistic data (amber score ~55, top reason "3 buyers pay
  30+ days late; cash lasts 5 weeks"). Real mode: HTTP calls to FINANCE_CORE_URL
  (GET /demo-company, POST /score, POST /receivables, POST /financing-pack).

### Step 3: Database
- supabase/schema.sql: companies, buyers, invoices, payments, scores,
  agent_actions (id, type, payload, status: drafted/approved/rejected, created_at).
- scripts/seed.ts: loads getDemoCompany() into the tables.

### Step 4: Agent
- /api/agent: Claude tool-use loop. Tools:
  get_score, get_receivables, draft_reminder(buyer_id), build_financing_pack.
- draft_reminder writes a draft email to agent_actions with status "drafted". It never sends.
- /api/approve: sets an action to approved or rejected and logs it.
- System prompt: answer only from tool data, cite numbers, keep answers short.

### Step 5: Screens
- /dashboard: score gauge (red 0-40, amber 40-70, green 70-100), top reasons,
  list of overdue buyers.
- /chat: copilot chat with Approve / Reject buttons on drafted reminders.
- /bank: one-page company view built from the financing pack.
- Clean, simple design. Must look good on a laptop projector.

### Step 6: KSeF TEST (optional, stop if blocked after 2 hours)
- scripts/ksef-push.ts: authenticate to api-test.ksef.mf.gov.pl with a self-signed
  certificate, push 5 demo invoices, save the responses to evidence/ksef/.

### Step 7: Submission pack
- TECHNICAL.md: architecture diagram (Mermaid), how the agent works, security design.
  Leave a section "Score algorithm" for Wojciech.
- SECURITY.md: permission tiers (read / draft / needs owner click) and a known-risk list.
- Tests for /api/agent and /api/approve.
- scripts/export-log.ts: exports agent_actions as evidence/execution-log.json.

# Paperbridge

AI finance copilot for small Polish B2B companies. It reads e-invoices and bank payments,
shows a red-to-green health score, drafts reminders for late invoices, and builds a
bank-ready financing pack. The AI only drafts; every action needs an owner click.

Stack: Next.js (App Router, TypeScript, Tailwind), Supabase (Postgres), Anthropic SDK.

## Setup

Requirements: Node.js 20 or newer (LTS recommended).

```bash
npm install
cp .env.example .env.local   # Windows PowerShell: Copy-Item .env.example .env.local
```

Fill in `.env.local`:

| Variable            | Where to get it                                         |
| ------------------- | ------------------------------------------------------- |
| `SUPABASE_URL`      | Supabase dashboard > Project Settings > API             |
| `SUPABASE_ANON_KEY` | Same page, "anon public" key                            |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com > API Keys                |
| `FINANCE_CORE_URL`  | Wojciech's finance-core API. Leave empty for mock data. |

## Database

1. Create a free project at https://supabase.com.
2. Open SQL Editor, paste `supabase/schema.sql`, and click Run.
3. Load the demo company: `npm run seed`
   (`npm run seed -- --reset` also clears the agent action log for a fresh demo run.)

## Run

```bash
npm run dev     # http://localhost:3000
npm run build   # production build check
npm run lint
npm run check:finance-core   # print score, receivables and financing pack
npm run doctor               # checks keys, Supabase tables and seed data; says what to fix
```

Without Supabase keys, the dev server keeps the action log in memory (marked "Local test log" in the chat).
Production always requires Supabase.

Without `FINANCE_CORE_URL` the app uses mock finance-core data from `lib/mockData.ts`.

## API

| Route          | Body                                                      | What it does                                                  |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| `/api/agent`   | `{ messages: [{ role, content }] }`                       | Runs the copilot. Streams NDJSON events: `step`, `text`, `tool`, `draft`, then `done` or `error` (one friendly line). |
| `/api/actions` | (GET)                                                     | The action log, newest first.                                 |
| `/api/approve` | `{ action_id, decision: "approved" \| "rejected" }`       | Owner decision on a draft. Records it; never sends anything. |

Every tool call and every decision is a row in `agent_actions`.

## Deploy (Vercel)

1. Push the repo to GitHub.
2. On https://vercel.com/new, import the repo. Vercel detects Next.js automatically.
3. Under Settings > Environment Variables, add the four variables from `.env.example`.
4. Deploy. Later pushes to the main branch redeploy automatically.

Or from the command line: `npx vercel` (preview) and `npx vercel --prod`.

## Project layout

```
app/            pages and API routes
lib/            Supabase and Anthropic clients, finance-core client and mock data
types/sme.ts    SME profile contract shared with finance-core
scripts/        command-line scripts (run with tsx)
.env.example    environment variables template
```

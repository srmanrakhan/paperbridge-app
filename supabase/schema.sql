-- Paperbridge schema. Paste into Supabase > SQL Editor and run. Safe to re-run.
-- Text ids (c1, b1, i01...) come from the finance-core demo profile, so seeding is idempotent.

create table if not exists companies (
  id                 text primary key,
  name               text not null,
  nip                text not null,
  city               text not null,
  industry           text not null,
  annual_revenue_pln numeric(14,2) not null,
  cash_balance_pln   numeric(14,2) not null,
  monthly_costs_pln  numeric(14,2) not null
);

create table if not exists buyers (
  id                 text primary key,
  company_id         text not null references companies(id) on delete cascade,
  name               text not null,
  nip                text not null,
  email              text not null,
  payment_terms_days int  not null
);

create table if not exists invoices (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  buyer_id   text not null references buyers(id) on delete cascade,
  number     text not null,
  issue_date date not null,
  due_date   date not null,
  amount_pln numeric(14,2) not null,
  status     text not null check (status in ('paid', 'open'))
);

create table if not exists payments (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  invoice_id text not null references invoices(id) on delete cascade,
  buyer_id   text not null references buyers(id) on delete cascade,
  date       date not null,
  amount_pln numeric(14,2) not null
);

create table if not exists scores (
  id                bigint generated always as identity primary key,
  company_id        text not null references companies(id) on delete cascade,
  score             int  not null check (score between 0 and 100),
  band              text not null check (band in ('red', 'amber', 'green')),
  reasons           jsonb not null,
  cash_runway_weeks numeric(5,1) not null,
  computed_at       timestamptz not null default now()
);

-- Every agent tool call and every owner decision lands here.
--   type = tool name (get_score, draft_reminder, ...) or 'approval'
--   status: 'drafted'  -> a draft waiting for the owner (draft_reminder)
--           'approved' / 'rejected' -> the owner's decision
--           'logged'   -> read-only tool call, nothing to approve
create table if not exists agent_actions (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  status     text not null check (status in ('drafted', 'approved', 'rejected', 'logged')),
  created_at timestamptz not null default now()
);

create index if not exists agent_actions_created_at_idx on agent_actions (created_at desc);

-- Owner settings and demo-simulated payments, one jsonb row per key ('workspace').
create table if not exists app_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Columns added after the first version of this schema.
alter table companies add column if not exists address text;
alter table companies add column if not exists monthly_revenue jsonb;

-- Access: the app only talks to Supabase from server code (API routes, scripts) with the anon key,
-- which is never sent to the browser. Demo data only. See SECURITY.md.
alter table companies     disable row level security;
alter table buyers        disable row level security;
alter table invoices      disable row level security;
alter table payments      disable row level security;
alter table scores        disable row level security;
alter table agent_actions disable row level security;
alter table app_state     disable row level security;

grant select, insert, update, delete on companies, buyers, invoices, payments, scores, agent_actions, app_state to anon;

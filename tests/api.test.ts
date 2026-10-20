import assert from "node:assert/strict";
import { test } from "node:test";

// No keys: demo mode and the in-memory action log.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
process.env.DEMO_COMPANY = "drukarnia"; // the tests are written against the printing-house demo

test("/api/agent in demo mode drafts reminders and never sends", async () => {
  const { POST } = await import("../app/api/agent/route");
  const res = await POST(
    new Request("http://x/api/agent", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "Draft reminders for buyers 30+ days late" }] }),
    }),
  );
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  const drafts = events.filter((e) => e.type === "draft");
  assert.ok(drafts.length >= 1);
  assert.ok(drafts.every((d) => d.action.status === "drafted"));
  assert.equal(events.at(-1).type, "done");
});

test("/api/agent rejects a malformed request", async () => {
  const { POST } = await import("../app/api/agent/route");
  const res = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [] }) }));
  assert.equal(res.status, 400);
});

test("/api/approve records a decision once and rejects a second one", async () => {
  const { logAction, listActions } = await import("../lib/actions");
  const { POST } = await import("../app/api/approve/route");
  const draft = await logAction("draft_reminder", { buyer_name: "Test" }, "drafted");
  const send = (decision: string) =>
    POST(new Request("http://x/api/approve", { method: "POST", body: JSON.stringify({ action_id: draft.id, decision }) }));

  assert.equal((await send("approved")).status, 200);
  assert.equal((await send("rejected")).status, 409);
  assert.equal((await send("maybe")).status, 400);
  const log = await listActions();
  assert.ok(log.some((a) => a.type === "approval" && a.status === "approved"));
});

test("affordability: verdicts across prices, never a zero or negative shortfall", async () => {
  const { DEMO_PROFILE } = await import("../lib/mockData");
  const { computeAffordability } = await import("../lib/affordability");
  const run = (price: number, extra?: number) =>
    computeAffordability(structuredClone(DEMO_PROFILE), { name: "Asset", price_pln: price, extra_revenue_per_month_pln: extra });
  assert.equal(run(6_000).verdict, "yes");
  assert.match(run(6_000).headline, /won't change much/);
  assert.equal(run(40_000).verdict, "tight");
  assert.equal(run(120_000).verdict, "not_from_cash");
  const big = run(200_000);
  assert.equal(big.verdict, "not_from_cash");
  assert.equal(big.without.length, 14);
  assert.ok(big.short_pln > 0);
  assert.equal(big.payback_months, null);
  assert.equal(run(1_000_000).verdict, "not_from_cash");
  assert.equal(run(120_000, 5_000).payback_months, 24);
  for (const p of [6_000, 120_000, 200_000, 1_000_000]) {
    const a = run(p);
    assert.ok(a.options.every((o) => o.covers_pln > 0));
    assert.equal(a.show_financing, a.verdict !== "yes");
  }
});

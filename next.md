Apply the apple.com design direction from CLAUDE.md throughout. Git commit after each part. Summary 2 lines per part.

TONE (applies everywhere): calm, supportive, never alarming. The owner should feel in control, not in trouble. Lead with what's going well, then what to look at. Say "3 invoices need a follow-up", not "you're in debt" or "needs attention". Use amber and red sparingly; no red text in headlines.

1. Flow: / → /login → /welcome → /start → /dashboard.
- /login: clean centred card, Paperbridge wordmark, email and password prefilled with demo credentials (anna@drukarniawisla.pl), a "Sign in" pill button and a secondary "Sign in with KSeF" button. No real auth; any click logs in.
- /welcome: full-screen, centred: "Welcome back, Anna." with "Drukarnia Wisła" in grey below. Fade in, then a short sync line "Syncing KSeF and bank… 15 invoices, 7 payments" with a counter, then auto-go to /start after ~3s (with a "Skip" link).
- /start: "Where would you like to start today?" with 4 large, calm option tiles in a 2×2 grid, each with a short title and one grey line:
  · "Add documents": "Upload invoices or a bank statement, and we'll read them for you." → /data
  · "Can I afford it?": "Check a purchase against your next 13 weeks of cash." → /afford
  · "See my overview": "Your business at a glance." → /dashboard
  · "Explore financing": "See what banks could offer you." → /financing
  Plus a small link "Ask the copilot anything →".

2. Dashboard less cramped: wider layout (max ~1200px). Above the fold, two columns: left, the greeting "Good afternoon, Anna." (one line, ~48px, time-of-day aware) plus the briefing rows, with the first row positive (e.g. "Revenue is up 8% this quarter"); right, the health score card (large 55, calm amber, one supportive line like "Steady, with a few invoices to follow up"). Below, full width: the numbers band, then "Who owes you". More vertical space between sections (96px+), consistent spacing.

3. Consistency: the briefing text and the buyer list use the same threshold from settings. Remove the "Under 13 days" label; show nothing for buyers below the threshold.

4. Documents scan (keep it simple and reliable):
- Generate demo documents in /demo-docs, also downloadable from /data: 2 invoice PDFs (realistic Polish VAT invoices from Drukarnia Wisła to existing buyers, KSeF-style numbers), 1 KSeF FA(3) XML invoice, 1 bank statement CSV with a payment from Hurtownia Bałtyk matching one of their overdue invoices.
- Login always starts from the basic demo state (the current data). A "Reset demo data" button on /data restores it.
- /data upload: drag and drop multiple files, with progress per file ("Reading invoice 1 of 4…").
- Extraction: XML and CSV parsed in code. PDFs: if ANTHROPIC_API_KEY is set, send them to Claude to extract the fields as JSON; otherwise use the matching pre-extracted JSON for the demo files.
- Before saving, show "Here's what we found": new invoices (buyer, amount, due date), payments matched to which invoice, and the impact (score, runway and overdue, before → after). Buttons: Confirm / Cancel.
- On Confirm: save, log it in the action log, update the dashboard and Passport, and show a short positive confirmation ("Done. Bałtyk's payment is matched and your runway is now 6 weeks.").

Finally, click through login → welcome → start → dashboard, and start → add documents → scan → confirm → dashboard. Fix anything broken.

# Redesign notes (apple.com style)

Applies CLAUDE.md "Design direction". Dashboard and Passport first, then the rest.

## Principles
- One idea per screen: a big number or sentence, one blue button.
- White and #f5f5f7 sections alternate; hairlines (#e8e8ed) only between list rows.
- Type scale: 120 / 72 / 48 / 40 / 28 / 21 / 17 / 14 / 13. Body 17px. Numbers tabular.
- Blue #0071e3 only for buttons and links. Green, amber, red only for state, always with a label.
- No shadows, gradients, emojis or monospace. Rounded 22-24px cards on #f5f5f7.

## /dashboard (done)
1. AI briefing card first: 3 items, the first "Planning an investment? Check if you can afford it".
2. Score as a 120px number with a three-band gauge (At risk / Needs attention / Healthy) and marker.
3. "Why 55": reasons with points. Grey band with three key numbers. "Who owes you" list.

## /bank Passport (done, already A4 and prints to 1-2 pages)
Header with company, verification code and QR; financing request as the largest figure; key figures; score
parts; ageing and concentration; revenue; invoice history. Keep black on white for print; status words, not colours.

## /afford and /financing (new)
Centered headline and one form row. Verdict sentence at 34px, three stats, chart on a grey band,
options as hairline rows, one blue button "Find financing". Financing: consent lists, then three offer cards
side by side with the best value tagged in green text. "Demo offers" label on every offer screen.

## /, /chat, /settings
- /: one headline, one subline, one button.
- /chat: suggestions as pills, streamed answer, draft card on grey, small "Demo mode" label when no API key.
- /settings: plain rows with a switch or choice each, one save button.

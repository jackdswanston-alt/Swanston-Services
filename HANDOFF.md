# HANDOFF — Swanston Services website

For whoever picks this up next. Written 4 Sep 2026 at the end of the build
session. Read this before touching anything.

---

## STATUS — updated 5 Sep 2026

Pushed, deployed, and live. The original "push it first" instruction is done:
`origin/main` and local `main` match, `_stray/` is gone, and the site is
serving from Cloudflare Workers at
`swanston-services.jackswanston.workers.dev`.

**Remaining, in order:**

1. **Web3Forms key** — `web3formsKey: ""` near line 515 of `index.html` is still
   empty, so the form falls back to opening the visitor's email client. Sign up
   at web3forms.com with **jackdswanston@gmail.com**, paste the access key into
   that string, commit, push. (Their signup sits behind a bot challenge, so this
   has to be done by a person.)
2. **One real submission** from the live URL once the key is in. Every test so
   far used a mocked endpoint.

**Done since the original handoff:** push, `_stray/` cleanup, Cloudflare
deploy, `og-image.jpg` (1200x630, generated from the site's own colors and
fonts), absolute `og:image` / `og:url` / `canonical` tags pointing at
swanstonservices.com.

---

## WHO / WHAT

**Jack Swanston** (goes by BigMoneyJack), Austin TX. Runs **Swanston Services** —
land clearing, brush and tree removal. He is a student running this as a real
business with real clients. Not technical: explain terminal steps concretely,
don't assume he knows what `cd` does.

Contact, and it's public on the site: (512) 902-3213 ·
jackswanston@swanstonservices.com · domain will be swanstonservices.com

**Motto: "Cut. Clear. Haul."** He rejected two earlier options. Don't rewrite it.

---

## FILES

`~/Projects/swanston-services/`

| File | What |
| --- | --- |
| `index.html` | The entire site. 38 KB, single file, no build, no dependencies |
| `README.md` | Setup + maintenance notes. Read it too |
| `.gitignore` | `.DS_Store`, `*.log` |
| `_stray/`, `.git/_stray/` | **Delete these.** Artifacts of a tooling limitation, not real |

There is no build step. Open `index.html` in a browser to preview. Edit it
directly — there is no source-vs-output split on his machine.

---

## STATE OF PLAY

**Done:** site built, content finalised through many rounds of his edits, full
adversarial code review completed, all 19 findings fixed and re-verified,
committed locally as `2812f6f`.

**Not done, and blocking launch:**

1. **Push to GitHub** (above)
2. **Deploy** — Cloudflare Pages. Workers & Pages → Create application → Pages →
   Connect to Git → pick the repo → no build command, output directory `/`
3. **Web3Forms key** — `web3formsKey: ""` in the CONFIG block near the bottom of
   `index.html` is still empty. Until it's set, the form falls back to opening
   the visitor's email client. He needs to get the key at web3forms.com (free,
   250/mo) using the deployed URL, then paste and redeploy
4. **`og-image.jpg`** — referenced in the meta tags, does not exist. Social
   shares currently render as bare text. Needs a 1200×630 image beside
   `index.html`. He has job photos; ask him for one
5. **One real test submission** from the live URL before he spends on ads. Every
   test so far used a mocked endpoint

---

## DECISIONS THAT MUST NOT BE CASUALLY REVERTED

These look like oddities. They are all deliberate and most were bugs once.

- **Never say: lawn, mowing, yard, landscaping, cleanup, maintenance.** The
  entire positioning is "the overgrown ground behind the house, not routine yard
  service." Those words attract price-shoppers for a different job. This rule
  also governs the ad keywords
- **The submit button ships `disabled`** and JS enables it. Without this, a
  script error made the button do a native GET submit that reloaded the page and
  silently wiped the form
- **Failure must never render as success.** `showSent()` runs only on `r.ok`.
  Everything else goes to `showFailed()`, which keeps the form populated and
  offers retry. This was the worst bug found — the site used to say "Got it" on
  a 500 or an offline phone, and the lead vanished
- **Submissions are written to `localStorage` before the network call**, keyed,
  and cleared on confirmed success. Safety net for lost leads
- **The `botcheck` honeypot is actually read** and short-circuits before the
  network. It used to be hardcoded to `""` and did nothing
- **`--blaze` #A65E0C and `--line` #868F84** were chosen to hit WCAG AA
  (4.97:1 and 3.35:1). Lightening either fails contrast
- **The "Roughly how big" dropdown is a hand-built listbox**, not a `<select>` —
  native ones can't be themed. Escape, arrows, type-ahead, `aria-activedescendant`
  and focus return are all wired. If you touch it, re-test all of those
- **Anchor links offset 72px** so the sticky header doesn't cover section tops
- **No photos on the site.** He removed them all deliberately. Don't add stock

---

## HOW TO VERIFY CHANGES

No test suite exists. If you change the form or the widget, check by hand:

1. Submit with fields empty → names only the missing ones
2. Submit with phone `asdfasdf` → rejected, not sent
3. Simulate a failed send → failure banner, form still populated, retry works
4. Tick `botcheck` in devtools → no network call, decoy confirmation
5. Dropdown: click open then Escape; arrow + type "u"; Enter commits the value
6. Widths 320 / 390 / 768 / 1440 → no horizontal scroll
7. Dark mode (OS setting) → form fields still legible

---

## ELSEWHERE

**Fall campaign kit** — a separate Claude artifact holding Facebook and Nextdoor
posts, Google/Meta ad copy with character counts, door hanger copy and a
Sept–Nov plan. Ask him for the link if it's needed; it isn't in this repo. The
word-choice rule above applies to all of it.

**Related ventures** (don't conflate): Swanston Land Experiences, and Skinner
(skinnerwild.com).

---

## TOOLING GOTCHA

If you're a cloud-based Claude reaching this Mac through a bridge: that shell
**cannot delete files**, so `git` writes there strand `.lock` files and leave the
repo unusable for the next command. That's where `_stray/` came from. Do local
git work from the user's own terminal, or from Claude Code running on his
machine — not from a remote sandbox.

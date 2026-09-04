# Swanston Services — website

Single-file marketing site. Everything (HTML, CSS, JS) lives in `index.html`.
No build step, no dependencies. Open it in a browser to preview.

**Cut. Clear. Haul.** — land clearing, brush and tree removal.

## Before it goes live

Open `index.html` and find the `CONFIG` block near the bottom (search for
`EDIT THESE LINES`). One value still needs filling in:

```js
web3formsKey: ""   // <- paste your Web3Forms access key here
```

Get it free at web3forms.com — enter jackswanston@swanstonservices.com, click the
verification link they email, and paste the key they give you between the quotes.
Free tier covers 250 submissions/month.

Until that key is set, submitting the form opens the visitor's own email app with
the details pre-filled instead of emailing you directly.

Phone and email are also in that block if they ever change — they populate the
header, hero, and footer automatically.

## Hosting

Static file, so any static host works. Cloudflare Pages and Netlify both allow
commercial use on their free tier; Vercel's free Hobby plan does NOT (business
use requires Pro at $20/mo).

Cloudflare Pages: Workers & Pages > Create > Pages > Upload assets > drag
`index.html` > add the custom domain when you have one.

## Structure

| Section | What it is |
| --- | --- |
| Header | Sticky bar: wordmark, phone, Free Quote button |
| Hero | Cut. Clear. Haul. + two CTAs |
| `#services` | What we clear — eight items |
| `#how` | Three steps |
| `#promise` | Signed guarantee |
| `#quote` | Quote request form |
| `#contact` | Footer with contact details |

## Recovering a lost enquiry

Every submission is written to the visitor's own browser (`localStorage`, key
`swanston_quotes`) *before* the network is touched, and removed once the send is
confirmed. If someone says they submitted a form you never received, and they
still have the same browser open, that record is retrievable — open the console
on the site and run:

    JSON.parse(localStorage.getItem('swanston_quotes'))

Anything left in there is a submission that never reached us.

## Notes for future edits

- The "Roughly how big" dropdown is a custom listbox, not a native `<select>` —
  native ones can't be themed. Keyboard support is wired up; keep it if you edit.
- Required fields: name, phone, email, property address.
- The form has a hidden `botcheck` honeypot field. Leave it alone; it filters spam.
- Anchor links offset by 72px so the sticky header doesn't cover section tops.
- Never use the words: lawn, mowing, yard, landscaping, cleanup, maintenance.
  The whole positioning is "the overgrown ground behind the house," and those
  words attract the wrong calls.
- The submit button ships `disabled` and is enabled by JS. That is deliberate:
  if the script fails, a click used to reload the page and silently wipe the
  form. Do not remove the `disabled` attribute.
- Failure must never render as success. `showSent()` runs only on `r.ok`;
  everything else goes to `showFailed()`, which keeps the form populated.
- The `botcheck` honeypot is now actually read. A ticked box short-circuits
  before the network and shows a decoy confirmation.
- Colour tokens were chosen to hit WCAG AA. `--blaze` (#A65E0C) is 4.97:1 with
  white and `--line` is 3.35:1 against the form. Lightening either breaks AA.
- `og-image.jpg` is referenced but not yet created — add a 1200x630 photo next
  to index.html or social shares fall back to text only.

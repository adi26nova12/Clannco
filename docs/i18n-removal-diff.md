# i18n dictionary removal — captured diff

Captured before deleting the runtime translation dictionary (Phase 0).

**Method:** loaded each page from the local server, let its own `applyLang(curLang)` run,
then diffed every `[data-i18n]` element's rendered `innerHTML` against the same element
parsed from the raw file. The dictionary wins at runtime, so "dictionary" = what visitors
see today, "markup" = what the HTML file actually says.

## Scale

| Page | `[data-i18n]` els | unique keys | differing |
|---|---|---|---|
| `/index.html` | 134 | 126 | **4** |
| `/automation/index.html` | 135 | 125 | **2** (+1 whitespace-only) |
| 6 vertical pages | 12 each | 7 each | **0** |

122 of 126 homepage keys were identical. The dictionary was only actually changing 6
elements across the whole site.

## `/index.html` — 4 keys

In all four the markup is the NEWER copy and the dictionary reverts it to the older
local-business pitch. Deleting the dictionary therefore *fixes* the copy and aligns the
page with the staged "visibility layer feeds the automation layer" framing.

| key | markup (kept) | dictionary (discarded) |
|---|---|---|
| `engine_eyebrow` | Growth systems — one input into the bigger picture | The Clannco system |
| `engine_h2` | Six services. One fixed price. Visibility handled, so the automation has something to point at. | Six services. One fixed price. Everything pointing at more customers. |
| `engine_lead` | Being findable is table stakes, not the whole strategy. This is the visibility layer — website, local SEO, socials — that feeds the automation and CRM system above with real inbound demand. | Marketing is a two-way partnership. You know your customers, your neighbourhood… |
| `footer_copy` | © 2026 Clannco · AI Automation & Operational Intelligence | © 2026 Clannco · Built for local businesses · Every city, every neighbourhood |

## `/automation/index.html` — 2 keys

| key | resolution |
|---|---|
| `cta_btn2` | Markup kept: "Tell us what's slowing you down" (newer B2B copy). Dictionary discarded: "Get a free website audit". |
| `pricing_note` | **Markup edited to match the dictionary.** Markup said "Message us on Telegram"; the dictionary rendered "WhatsApp". WhatsApp is kept because it matches the site's actual contact channel — the floating FAB and footer both link to `wa.me/918968806535`. This is the only place a visible string was preserved *against* the markup. |

`hero_h1` differed only in whitespace (newlines vs spaces) — not a content change.

## Net effect on visitors

5 visible strings change, all on the two index pages, all moving toward the current B2B
positioning. Nothing changes on the 6 vertical pages.

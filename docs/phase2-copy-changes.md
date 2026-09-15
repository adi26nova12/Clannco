# Phase 2 — homepage copy changes

Decision recorded in the plan: keep both pitches, **explicitly staged** — the visibility layer feeds the automation
layer. The six-step centrepiece (`#search-showcase`) is where that staging became visible, so its step labels now name
the layer each step belongs to. Headlines are unchanged. Only `index.html` is affected; the automation pages' step copy
is untouched.

| step | before | after |
|---|---|---|
| 01 label | 01 — Visibility | 01 — Visibility layer · Website |
| 02 label | 02 — Google Maps | 02 — Visibility layer · Maps |
| 03 label | 03 — Proof | 03 — Visibility layer · Reviews |
| 04 label | 04 — Presence | 04 — Visibility layer · Social |
| 05 label | 05 — Always on | 05 — Automation layer · Always on |
| 06 label | 06 — Growth | 06 — The system · Growth |
| 06 body | Six services, one fixed price, all pointing at the same outcome — more people walking through your door. | The visibility layer brings people in; the automation layer answers, books and follows up — so demand turns into customers without you in the loop. |

To revert, restore these strings in `index.html` (they are the `data-i18n="m1_k"` … `m6_k` and `m6_p` elements).

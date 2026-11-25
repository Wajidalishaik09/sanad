# Sanad

*Every claim, traced to its source.*

A reference manager and AI research assistant in which the AI is never permitted to produce a
citation. Built for the SP Jain AI Club Hackathon 2026 by Team 2.

## Run it

No build step, no install. Either open `index.html` directly, or:

    cd sanad && python3 -m http.server 8000

then visit http://localhost:8000

## What works now

The verification engine. Open the **Verify** tab, press *Load demo set*, then *Check these references*.
The demo set contains, in order: two real papers, one real DOI attached to the wrong paper, one
fabricated DOI, and one reference with no DOI at all that does not exist.

## Files

| File | Contains |
|---|---|
| `index.html` | The three tabs: Verify, Find sources, Library |
| `style.css` | Design tokens at the top. Change `--font-body` to reskin the whole app |
| `app.js` | Verification engine, search, library, APA 7 export |
| `CLAUDE_CODE_PROMPT.md` | Paste into Claude Code to continue building |

## Before the demo

Change `CONTACT` at the top of `app.js` to a real team address — it puts us in Crossref's polite pool
(10 requests/second instead of 5).

# Sanad

*Every claim, traced to its source.*

A reference manager and AI research assistant in which the AI is never permitted to produce a
citation. Built for the SP Jain AI Club Hackathon 2026 by Team 2.

## Run it

No build step, no install. Node 18 or newer:

    cp .env.example .env      # add your own keys; .env is git-ignored
    node server.js            # http://localhost:8000

With no network, press **Demo mode**: every lookup uses recorded real data.

## The seven agents

Scout finds, Librarian organises, Scribe writes, Auditor checks references, Quote Checker checks
quotes, Challenger argues back, Access finds a legal open copy. **Access is agent 7. It shows links
only (from Unpaywall) and never changes a verdict, a trust label or a gate.** If Unpaywall gives no
answer it says "Could not check right now", never "no open copy".

## Files

| File | Contains |
|---|---|
| `app.js` | Verification engine, search, Scribe, Challenger, gates, export |
| `store.js` | Saving in the browser |
| `librarian.js` | Folders, tags, notes, duplicates |
| `writing.js` | Writing surface and @ citations |
| `quotecheck.js` | Quote Checker |
| `access.js` | Access: links to open copies |
| `fixtures.js`, `fixtures/` | Demo mode and recorded data |
| `api/`, `lib/` | Server routes; the only place keys are used |
| `scripts/capture-fixtures.js` | Records the demo data |

# Starting prompt — paste this into Claude Code

Open a terminal, `cd` into this folder, run `claude`, and paste everything below the line.

---

I am building **Sanad** ("evidence; the document that proves it") for the SP Jain AI Club
Hackathon 2026. I am on Team 2. The deck is due Thursday 26 November at 9:00 AM; on the day we get
90 minutes to adapt to surprise requirements, so the code must stay small and easy to change.

## The problem
Reference managers (Zotero, Mendeley) are organised and trustworthy but slow. AI tools are fast but
invent references — fake DOIs, real authors attached to papers they never wrote, quotes that are not
in the source. The brief asks for one website that is both: the organisation of a reference manager
plus the speed of AI, without the invented references. The student must be able to find, organise and
cite sources, trust that every reference is real, trace every claim back to its source, and stay in
charge of every final decision.

## The core design idea
The AI is never asked to produce a citation. Search runs first against OpenAlex and Crossref; real
records come back; the AI only ever speaks about records already in the student's library, and may
only reference them as library IDs (`{"src":"L7"}`). A fabricated reference has no path into the
system. Prevention, not detection.

## Four agents
- **Scout** — finds. Searches OpenAlex and Crossref. Retrieves, never generates.
- **Scribe** — writes. Drafts under the cite-by-ID contract. The only agent that produces prose, so
  the guardrail lives here.
- **Auditor** — checks. Field-by-field verification, claim-to-source support, trust badges, retractions.
- **Challenger** — argues back. Finds papers that contradict the draft, flags where one study is being
  written up as settled consensus, names the shape of the evidence base, asks what the counter-argument is.

Two hard human gates: nothing enters the library without the student approving it, and export stays
locked until every claim is verified or explicitly accepted with a written justification.

## Trust labels, on every claim
Verified · Reported, not checked · AI reasoning · Not found.
"Not found" is a permitted output. Never substitute a guess, and never turn a network error into a
"fabricated" verdict.

## Current state of this folder
- `index.html` — three tabs: Verify, Find sources, Library
- `style.css` — all design tokens at the top. Font is Times New Roman via `--font-body`
- `app.js` — the working verification engine:
  - DOI extraction and normalisation (handles `doi:`, `https://doi.org/`, trailing punctuation)
  - Crossref `/works/{doi}` lookup with `mailto=` for the polite pool, OpenAlex fallback
  - Dice-coefficient title similarity, thresholds 0.90 match / 0.72 partial
  - Surname-only author matching, tolerant of "Vaswani, A." vs "Ashish Vaswani" vs "A. Vaswani"
  - Year comparison with ±1 tolerance for preprint vs published
  - Retraction detection via the Crossref `update-to` field
  - Real-DOI-wrong-paper detection, with a suggested correct DOI and one-click accept
  - Library in localStorage, APA 7 export
  - Response caching, 380ms spacing between calls, honest "cannot check" on rate limits

## What I need next, in this order
1. **Scribe + the writing surface.** A draft view where typing `@` opens the library and inserts a
   citation inline, attaching that claim to that source. Each sentence shows its trust badge in the
   margin. The LLM call must be JSON-schema-constrained so it can only emit library IDs; the front end
   refuses to render any other token and shows a "blocked" chip.
2. **Gate 2** — export locked until every claim is cleared.
3. **The Challenger.** Given the draft and the library, return contradicting papers and the shape of
   the evidence base (shared authors, median age, single country, all preprints).
4. **Quote-in-source check** against Europe PMC (CORS-enabled, no key) and OpenAlex abstracts.
5. **AI-use statement** generated from an activity log of every AI action, model and prompt.

## Constraints
- Plain HTML, CSS and JavaScript. No framework, no build step. I need to change this under time
  pressure on Thursday.
- Crossref needs no API key — keep verification keyless so it cannot break from a quota.
- OpenAlex has required API keys since 13 February 2026. Keep any key server-side, never in `app.js`.
- Times New Roman everywhere, set once in `--font-body`.
- Explain your reasoning before you write code: why this step now, why this approach over the
  alternatives, and what the output means.

Start by reading the three files, then tell me what you would build first and why before writing anything.

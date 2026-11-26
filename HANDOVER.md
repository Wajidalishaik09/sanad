# Sanad — where things stand

Repo: https://github.com/Wajidalishaik09/sanad (public)
Local: `Downloads/Hackthon/websites/sanad`

---

## Run it on the Mac

    cd Downloads/Hackthon/websites/sanad
    cp .env.example .env          # then paste your Gemini key into .env
    node server.js                # http://localhost:8000

Without a key everything still runs; Scribe extracts real sentences from real
abstracts instead of writing them. Check the activity log in the sidebar to see
which path ran.

---

## The seven agents

| Agent | Role | What it actually does |
|---|---|---|
| Scout | finds | Searches OpenAlex. Retrieves only — it cannot generate a paper. |
| Librarian | organises | Spots the same work counted twice (preprint vs published), tags from OpenAlex topics, flags sources with no abstract or no open access. |
| Scribe | writes | Drafts under the cite-by-ID contract. May emit library IDs and nothing else. |
| Auditor | checks | DOI resolves, title, authors, year, retraction. Assigns the trust label. |
| Quote Checker | checks quotes | Looks for quoted words in the abstract, then in open-access full text (Europe PMC, NCBI). Red only if full text was searched. |
| Challenger | argues back | Contradicting papers, thin evidence, the shape of your source base, the claim it would attack first. |
| Access | traces to the source | Agent 7. Links only: asks Unpaywall for a legal open copy. Never changes a verdict, label or gate. No answer is "Could not check right now". |

Patron and Isnad are kept behind the Extras button, outside the main flow.

Two gates the student must pass: **Gate 1** nothing enters the library unapproved,
**Gate 2** nothing exports until every claim is verified or accepted in writing.

---

## What is tested and what is not

**Tested:** all parsing and matching logic (DOI extraction, title similarity,
surname matching across formats, year tolerance). Page renders with no console
errors. Seven agents lay out correctly.

All seven agents have been run against the live services and in demo mode with outside hosts blocked.
The Vercel deployment has not been tested.

**Check a reference.** Red "Could not be verified" means both databases answered. Amber "Not yet verified"
means a check could not run. "Partly verified" needs a registered DOI, a close title and a shared author. A
similar real paper is shown below the verdict, never as the verdict. Internal names (`Not found`, `Cannot check`,
`Unconfirmed`) are used in code; `headline` is what is shown.

**Export** (`export.js`). The APA 7 list and the short AI use statement are always available. Gate 2 still governs
the student's text and the full statement. Every reference ends with its status label, Verified included.

---

## Do these first, in this order

1. `node server.js`, walk the full flow once end to end. Fix what breaks.
2. Check a reference → Load example references → Check a reference. The third entry is a real DOI on the
   wrong paper; confirm it goes red.
3. Approve 4–5 sources and run the chain stage. If OpenAlex has no reference data
   for them, Isnad says so honestly rather than claiming independence.
4. Write the deck from what actually works, not from this file.

---

## The demo, when it comes

Ask a judge to open ChatGPT on their own phone, ask it for five references on any
topic, and read them out. Paste them in live. Unscripted and unfakeable.

Fallback if nothing goes red: load the published NeurIPS 2025 hallucinated
citations — fabricated references that got past peer review at the largest AI
conference in the world.

The line to open with: **others detect hallucinations after you have written.
Sanad makes them impossible to write.**

---

## Do not

Put the API key in `app.js`. The repo is public; a key there is scraped within
hours. It belongs in `.env`, which is git-ignored.

# SEO Article Review — GitHub Pages web app

Paste a draft, get **live SEO feedback + rewrite suggestions** as you type.
100% static (`index.html` + `styles.css` + `app.js` + `typos.js` + `seo-rules.json` + `favicon.svg`) — no build step, no backend, no feeds, no keys, nothing to maintain. Drafts never leave the browser (saved to `localStorage`).

**One-click fixes:** long sentences get a **Replace in draft** button whenever a safe rewrite exists — a genuine two-sentence split first, filler-trimming second, an explicitly-labeled tail-cut last. When nothing safe exists, the card shows the sentence with guidance and no button. Heading suggestions place content-aware titles (*"What is the Frontier Deployed Engineer Residency?"*) at detected paragraphs, or a marked placeholder where none can be derived — each with **Insert heading**. Applied fixes land in your draft; the panel confirms by clearing the issue. Cards are ranked by exact score impact (each shows its `+N` point gain), so the biggest wins float to the top. Cards with a fix also carry a **Find** button that jumps to the exact sentence or paragraph in your draft and highlights it. Most other suggestion cards have a **Done** button: if you've handled a step in a way the parser can't see (e.g. a link format it doesn't recognize), marking it Done counts that check as a manual pass — badged "done ✓", persisted in your browser, reversible, and clearing the draft resets the checklist.

Fields (all optional): **focus keyphrase, title, article summary** (doubles as meta description), **excerpt** (listing teaser), **article body** (Markdown or HTML; images intentionally ignored — applied later).

**House style — heading level:** `seo-rules.json → rules.body.sectionLevel` sets the section header the whole app works with (`3` = Neowin's `###` H3 style, `2` = standard `##`). Every heading check, the keyphrase-in-heading check, the structure template, the auto-placed heading insertions, and the stats readout follow it automatically — no code changes to switch styles.

**House style — site domain:** `rules.body.siteDomain` (`neowin.net`) tells link detection which absolute URLs count as internal. Neowin links internally with full URLs, so without this every link looked external.

## Title / snippet hooks

`seo-rules.json → powerWords` holds a 206-word hook list (CTR-oriented, Neowin's tech-news register) — "best", "proven", "budget", "mistakes", "review", "hands-on", "surprising", "roadmap", "leaked", "painless", "sleek" and so on. A title passes the hook check on a number, a power word, or both, and the check names which one it found. Same list drives `file://` fallback in `app.js`; keep the two in sync.

## Checks that read like a real editor

Beyond length bands and keyword placement, the app flags:

- **Emoji in title/summary** — usually dropped from the SERP and reads as clickbait (`rules.title.warnEmojiMax`).
- **Keyphrase stuffing in the title** — the same phrase 3+ times in 60 characters.
- **Summary needs a reason to click** — a call to action, with copy-ready examples.
- **Excerpt repeating the summary** — exact match *and* ≥70% word overlap (a listing page shouldn't show the same sentence twice).
- **Lists or tables in long drafts** — at 400+ words, all-prose is a wall to skim.
- **FAQ / questions section** — at 500+ words, Q&A is the format most likely to earn a featured snippet. The suggestion derives starter questions from *your own* section headings ("How to test a switch" → "How do I test a switch?").
- **Conclusion or takeaway** — at 400+ words, something to close on (and a natural place to restate the keyphrase).
- **Unhelpful link anchors** — bare URLs, `[https://…](https://…)` and "click here"/"read more"/"learn more" text. Descriptive anchors pass.
- **Transitions** — 61-word list (additive, contrastive, sequential and consequence markers) against a share of sentences.
- **Passive voice** — auxiliary + participle, with irregular participles ("was written", "were taken", "is built") and a guard so `is the reason` isn't mistaken for a passive clause.

Keyphrase matching is word-boundary aware, so `art` no longer matches inside "article" or `ai` inside "said". The last word takes an optional plural, so `budget mechanical keyboards` still matches "keyboard" in running text.

## Writing assistant (Grammarly-style, rule-based)

## Hashtags + article tags (generated from your draft)

Below the article box, the app extracts **hashtags** and **article tags** live from your title + body — company, product and versions first (`Anthropic`, `Claude Sonnet 5.5`, `GPT-6`), then keyphrase and frequent keywords. The version rule you asked about is baked in: dots never survive in hashtags (`Sonnet 5.5` → `#Sonnet55`, `GPT-6` → `#GPT6`, capped at sensible lengths) but are kept in article tags (`Sonnet 5.5`, `GPT-6`). Fragments are suppressed automatically (`European` never appears without `European Union`), with Copy buttons emitting space-joined hashtags and comma-separated tags.

## Writing assistant (Grammarly-style, rule-based)

Below the SEO checks, the **Writing assistant** panel reviews the article body live, grouped the way Grammarly groups them:

- **Correctness** (red): a 4,000-word spelling dictionary (curated from Wikipedia's common-misspellings list: single-correction entries only, US/UK variants and valid-word collisions filtered out against the system dictionary, typos inside URLs and `code spans` skipped) plus `should of→should have`, a/an agreement (`a apple→an apple`, silent-h and acronym exceptions included), lone lowercase `i→I`, repeated words, double spaces, space-before-punctuation, lowercase sentence starts, auto-resolved confusables (`their is→there is`, `your welcome→you're welcome`, `weather or not→whether`, `bigger then→bigger than`…) with one-click **Apply fix**, usage reminders quoting your actual sentences for the ambiguous ones, and missing-main-verb fragments with an is/are inserter (`…built on…` → `…is built on…`, plural-aware).
- **Clarity** (amber): 100+ wordy phrases (`due to the fact that→because`, `in order to→to`, `a great number of→many`, `at the end of the day→ultimately`…) with one-click fixes, `very + adjective` upgrades (`very good→excellent`, 45 mappings), qualifier overload (`really/just/quite/rather`).
- **Engagement** (blue): vague words with stronger alternatives (`good→strong/solid/compelling`), repeated sentence openers.
- **Delivery** (grey): hedging, slang, exclamation overload, plus a **tone meter** (Confident / Cautious / Casual / Enthusiastic), **grade level**, and **reading time**.

**Every card says what it changes.** Bulk cards (spacing, qualifiers, hedging, slang, exclamations, repeated openers, over-used words) quote your own draft and mark the exact span with `⟦like this⟧`, so it's obvious which characters **Apply fix** will touch — e.g. `…on Friday⟦ ,⟧which went well…`. Descriptive phrase cards quote the sentence containing the word; reminder cards quote up to two of your sentences to judge the ambiguity against.

Honest limits: full-sentence AI rewrites and plagiarism checking need a server and the open web — they're excluded on purpose so drafts never leave the browser. Browser-native spellcheck is also enabled on all text fields.

## Host on GitHub Pages

1. Push these files to a repo (root level).
2. Repo → **Settings → Pages** → Deploy from branch → `main` / `/ (root)` → Save.
3. Open `https://<you>.github.io/<repo>/`. Done. Relative `./` paths mean it also works under a `/repo-name/` subpath. No Actions, secrets, or workflows needed.

## Timeless by design (why nothing here phones home)

Nearly everything this app checks is stable craft, not news:

- **Snippet physics** — titles ~40–60 chars, summaries ~120–155: search-result UI truncates by width, and that constraint hasn't meaningfully moved in a decade.
- **Relevance signals** — keyphrase in title, intro, and a heading; unique summary vs excerpt: durable principles, not algorithm trivia.
- **Structure & depth** — real section headings, short paragraphs, internal + external links, substantive word count: what makes an article skimmable and citable doesn't expire.
- **Readability science** — Flesch, sentence length, passive voice, transitions: decades old.
- **Correctness & clarity** — spelling, grammar, wordiness: timeless.

The exact numeric bands (55 vs 60 chars, 2% vs 2.5%) may drift at the margins over the years — but "your 32-character title is too thin" is correct under every version of the guidance. If a band ever does need retuning, edit `seo-rules.json`, push, and Pages redeploys: the app follows that file with no code changes.

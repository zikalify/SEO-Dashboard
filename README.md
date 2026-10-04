# SEO Article Review — GitHub Pages web app

Paste a draft, get **live SEO feedback + rewrite suggestions** as you type.
100% static (`index.html` + `styles.css` + `app.js` + `seo-rules.json`) — no build step, no backend, no feeds, no keys, nothing to maintain. Drafts never leave the browser (saved to `localStorage`).

**One-click fixes:** long sentences get a **Replace in draft** button whenever a safe rewrite exists — a genuine two-sentence split first, filler-trimming second, an explicitly-labeled tail-cut last. When nothing safe exists, the card shows the sentence with guidance and no button. Heading suggestions place content-aware titles (*"What is the Frontier Deployed Engineer Residency?"*) at detected paragraphs, or a marked placeholder where none can be derived — each with **Insert heading**. Applied fixes land in your draft; the panel confirms by clearing the issue.

Fields (all optional): **focus keyphrase, title, article summary** (doubles as meta description), **excerpt** (listing teaser), **article body** (Markdown or HTML; images intentionally ignored — applied later).

**House style — heading level:** `seo-rules.json → rules.body.sectionLevel` sets the section header the whole app works with (`3` = Neowin's `###` H3 style, `2` = standard `##`). Every heading check, the keyphrase-in-heading check, the structure template, the auto-placed heading insertions, and the stats readout follow it automatically — no code changes to switch styles.

## Writing assistant (Grammarly-style, rule-based)

Below the SEO checks, the **Writing assistant** panel reviews the article body live, grouped the way Grammarly groups them:

- **Correctness** (red): common typos (`teh→the`, `definately→definitely`…), `should of→should have`, repeated words, double spaces, space-before-punctuation, lowercase sentence starts — all with one-click **Apply fix**.
- **Clarity** (amber): 25+ wordy phrases (`due to the fact that→because`, `in order to→to`…) with one-click fixes, `very + adjective` upgrades (`very good→excellent`), qualifier overload (`really/just/quite`).
- **Engagement** (blue): vague words with stronger alternatives (`good→strong/solid/compelling`), repeated sentence openers.
- **Delivery** (grey): hedging, slang, exclamation overload, plus a **tone meter** (Confident / Cautious / Casual / Enthusiastic), **grade level**, and **reading time**.

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

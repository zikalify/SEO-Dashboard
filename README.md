# SEO Article Review — GitHub Pages web app

Paste a draft, get **live SEO feedback + rewrite suggestions** as you type.
100% static (`index.html` + `styles.css` + `app.js` + `typos.js` + `seo-rules.json` + `favicon.svg`) — no build step, no backend, no feeds, no keys, nothing to maintain. Drafts never leave the browser (saved to `localStorage`).

**One-click fixes:** long sentences get a **Replace in draft** button whenever a safe rewrite exists — a genuine two-sentence split first, filler-trimming second, an explicitly-labeled tail-cut last. When nothing safe exists, the card shows the sentence with guidance and no button. Heading suggestions place content-aware titles (*"What is the Frontier Deployed Engineer Residency?"*) at detected paragraphs, or a marked placeholder where none can be derived — each with **Insert heading**. Applied fixes land in your draft; the panel confirms by clearing the issue. Cards are ranked by exact score impact (each shows its `+N` point gain), so the biggest wins float to the top. Cards with a fix also carry a **Find** button that jumps to the exact sentence or paragraph in your draft and highlights it. Most other suggestion cards have a **Done** button: if you've handled a step in a way the parser can't see (e.g. a link format it doesn't recognize), marking it Done counts that check as a manual pass — badged "done ✓", persisted in your browser, reversible, and clearing the draft resets the checklist.

Fields (all optional): **focus keyphrase, title, article summary** (doubles as meta description), **excerpt** (listing teaser), **article body** (Markdown or HTML). Image placement is still applied later, but **alt text is checked** in the body — see below.

## Short drafts get left alone

The single biggest source of bad advice in a checker like this is telling a 200-word news brief to add section headings, internal links and a FAQ. It can't use them, and the reader can tell.

`seo-rules.json → rules.body.minWordsForStructure` (300) is the switch. Below it, every structural check — **section headings**, **keyphrase in a heading**, **internal links**, **external citations** — reports `skip` with a zero weight instead of a warning, and says so: *"Sections not needed at 99 words… no H3s required. Past ~300 words this check switches on."* No score penalty, no suggestion cards, nothing to dismiss.

Past the gate the app behaves normally. The paragraph minimum scales too (1 under 100 words, 2 under 300, 3 above) instead of demanding three paragraphs from a two-sentence item.

Format suggestions use their own, deliberately high thresholds, because a list or a Q&A block is a *choice about shape*, not a fix for a defect:

| Card | Appears at | Why there |
| --- | --- | --- |
| `Add a list` | 600+ words | Below that there is no set of things worth bulleting. |
| `Add a conclusion` | 800+ words | A news item can legitimately end on its last fact. |
| `Add an FAQ` | 1200+ words | A Q&A block only works if the piece has real questions in it. |

Heading cards are also **capped at the actual shortfall** — a draft that needs one heading is offered one, and a draft whose heading check already passes is offered none at all.

**House style — heading level:** `seo-rules.json → rules.body.sectionLevel` sets the section header the whole app works with (`3` = Neowin's `###` H3 style, `2` = standard `##`). Every heading check, the keyphrase-in-heading check, the structure template, the auto-placed heading insertions, and the stats readout follow it automatically — no code changes to switch styles.

**House style — site domain:** `rules.body.siteDomain` (`neowin.net`) tells link detection which absolute URLs count as internal. Neowin links internally with full URLs, so without this every link looked external.

## What is and isn't a ranking factor

The rules were re-audited against Google's own documentation in October 2026, and the scoring model reflects what that documentation actually says. Anything Google has stated is **not** a ranking factor is reported as craft advice and never scored as a hard failure:

| Check | What Google actually says |
| --- | --- |
| Word count | *"The length of the content alone doesn't matter for ranking purposes (there's no magical word count target, minimum or maximum)."* So being short **warns**, it never fails — at any length. |
| Keyword density | Not a ranking factor (Cutts, 2011; Mueller, repeatedly). There is deliberately **no "your keyphrase is too rare" warning** — it pushed writers toward the repetition the upper bound exists to catch. Only over-repetition warns, and it never fails. |
| Flesch | Not a ranking factor, and technical register legitimately scores 30–50. Dense prose warns; it never fails. Readability *cards* only appear below Flesch 30. |
| Emoji in title/summary | Google renders emoji and filters them only when they read as spammy or misleading. No ranking effect — so this is a house-style call, and the copy says so. |
| Title / summary length | *"There's no limit on how long a `<title>` element can be"* — the title link is truncated by **pixel width**, not character count. The 40–60 / 120–155 bands are desktop estimates, and the wording says *truncated*, never "dropped". |
| Transitions, passive voice | Flow and clarity, not SEO. Both are weighted 0.25 and their copy says outright that they are writing checks. |

A missing keyphrase in the title also **warns** rather than fails — Google has no keyphrase-in-title requirement and rewrites titles often. The one keyword failure that survives is a focus keyphrase you set yourself and then never used anywhere in the draft, which is a genuine "is this even about that?" signal.

`title-hook` previously passed on any of 206 "power words", a list that includes `how`, `what`, `new`, `top` and `best` — so "How To Choose A New Keyboard" scored as a strong hook. `seo-rules.json → weakHookWords` now subtracts 65 of them, and the check needs a number or a genuinely strong word. It is weighted 0.5, because click-through is a CTR signal, not a ranking one.

`summary-cta` asks for a **reason to click**, not a literal call to action: a figure, an open question, an explicit benefit or a CTA verb all pass. Previously it warned on almost every summary.

## FAQ sections, honestly

The FAQ copy used to promise that a Q&A block was *"the format most likely to earn a featured snippet"*. That stopped being true twice: Google restricted FAQ rich results to well-known government and health sites in August 2023, and then **deprecated the FAQ search appearance entirely** — Google's docs state that as of 7 May 2026 FAQ rich results no longer appear in Google Search, with the rich result report and test support dropped in June 2026.

A Q&A block is still worth writing in a long piece: readers scan for it, and a self-contained two- or three-sentence answer is the shape search quotes from. That is the reason the card gives now. It is not a schema play, and the app says so rather than implying a rich result you cannot get.

## Title / snippet hooks

`seo-rules.json → powerWords` holds a 206-word hook list (CTR-oriented, Neowin's tech-news register) — "best", "proven", "budget", "mistakes", "review", "hands-on", "surprising", "roadmap", "leaked", "painless", "sleek" and so on — and `weakHookWords` holds the 65 of them too common to count as a hook on their own. A title passes the hook check on a number, a strong power word, or both, and the check names which one it found.

Both lists, and every threshold, are mirrored into `FALLBACK_RULES` at the top of `app.js`. That copy is not decoration: on a `file://` open the fetch fails and **the fallback is what everything actually reads**, so the two must stay identical. `tests/run.js` fails on any drift; regenerate the block with `node tests/sync-fallback.js`.

## Checks that read like a real editor

Beyond length bands and keyword placement, the app flags:

- **Image alt text** — Google's image guidance: *"the most important attribute when it comes to providing more metadata for an image is the alt text."* Both `![…](…)` and `<img>` are counted; missing alt text warns, one-word alt text warns as too thin to describe anything, descriptive alt text passes. With no images in the draft the check does not appear at all.
- **Emoji in title/summary** — no ranking penalty and search usually renders them, but they get filtered when they read as spammy (`rules.title.warnEmojiMax`).
- **Keyphrase stuffing in the title** — the same phrase 3+ times in 60 characters.
- **Summary gives no reason to click** — with copy-ready examples.
- **Excerpt repeating the summary** — exact match *and* ≥70% word overlap (a listing page shouldn't show the same sentence twice).
- **Unhelpful link anchors** — bare URLs, `[https://…](https://…)` and "click here"/"read more"/"learn more" text. Descriptive anchors pass.
- **Transitions** — 61-word list (additive, contrastive, sequential and consequence markers) against a share of sentences.
- **Passive voice** — auxiliary + participle, with irregular participles ("was written", "were taken", "is built") and a guard so `is the reason` isn't mistaken for a passive clause.

Keyphrase matching is word-boundary aware, so `art` no longer matches inside "article" or `ai` inside "said". The last word takes an optional plural, so `budget mechanical keyboards` still matches "keyboard" in running text.

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

## Tests

```
node tests/run.js        # 73 assertions, no dependencies
node tests/run.js -v     # list every assertion
```

There is no package manager, no bundler and no framework, so the suite is a single dependency-free Node script. `app.js` is a browser script with no module system, so the harness stubs the handful of DOM methods it touches (`getElementById`, `innerHTML`, `addEventListener`, `localStorage`, `fetch`), evaluates the real `app.js` and `typos.js` in a `vm` context, and reaches the internals through a shim appended to the source at load time — **app.js itself is never modified to make it testable**. `seo-rules.json` is served by the `fetch` stub exactly as a static host would serve it.

What it covers: every check trigger against fixtures at each threshold boundary; that a short brief produces zero structural warnings and zero structural cards; that word count, keyword density, title keyphrase and readability never fail at any input; that `weakHookWords` actually excludes the weak hooks; that every suggestion card points at a check that is genuinely failing; that heading cards are capped at the shortfall; that no retracted SEO claim ("dropped in search", "keyphrase rare", "most likely to earn a featured snippet", …) can reappear in any rendered string; that `FALLBACK_RULES` matches `seo-rules.json`; and the full render path including Load sample, Clear, Undo, Copy report and localStorage round-tripping.

The suite has been mutation-checked — reverting each individual fix produces failures, so it is not passing vacuously.

## Host on GitHub Pages

1. Push these files to a repo (root level).
2. Repo → **Settings → Pages** → Deploy from branch → `main` / `/ (root)` → Save.
3. Open `https://<you>.github.io/<repo>/`. Done. Relative `./` paths mean it also works under a `/repo-name/` subpath. No Actions, secrets, or workflows needed.

## Timeless by design (why nothing here phones home)

Nearly everything this app checks is stable craft, not news:

- **Snippet physics** — titles ~40–60 chars, summaries ~120–155: search cuts the result off by pixel width, and that constraint hasn't meaningfully moved in a decade. Neither field has an actual character limit.
- **Relevance signals** — keyphrase in title, intro, and a heading; unique summary vs excerpt: durable principles, not algorithm trivia.
- **Structure & depth** — section headings, short paragraphs, internal + external links, substantive coverage: what makes an article skimmable and citable doesn't expire. All of it now waits until the draft is long enough to have a structure.
- **Image metadata** — alt text: one attribute, documented, and always relevant when an article has images.
- **Readability science** — Flesch, sentence length, passive voice, transitions: decades old.
- **Correctness & clarity** — spelling, grammar, wordiness: timeless.

The one thing that is *not* timeless is the FAQ rich result, and it changed twice: restricted to government and health sites in August 2023, then deprecated outright in 2026. That is why the FAQ card now argues scannability rather than rich results.

The exact numeric bands (55 vs 60 chars, 600 vs 800 words) may drift at the margins over the years — but "your 32-character title is too thin" and "this 150-word brief does not need subheadings" are correct under every version of the guidance. If a band ever does need retuning, edit `seo-rules.json`, run `node tests/sync-fallback.js` to mirror it into the `file://` fallback, push, and Pages redeploys.

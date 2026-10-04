# SEO Article Review — GitHub Pages web app

Paste a draft, get **live SEO feedback + copy-ready rewrite suggestions** as you type.
100% static (`index.html` + `styles.css` + `app.js` + `seo-rules.json`) — no build step, no backend, drafts never leave the browser (saved to `localStorage`).

Fields (all optional): **focus keyphrase, title, article summary** (doubles as meta description), **excerpt** (listing teaser), **article body** (Markdown or HTML; images intentionally ignored — applied later).

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
3. Open `https://<you>.github.io/<repo>/`. Done. Relative `./` paths mean it also works under a `/repo-name/` subpath.

## How "always up to date" SEO rules work

There is no free, authoritative live SEO-rules API, so the app uses a better fit for a static site:

- All thresholds live in **`seo-rules.json`** (`version`, `updated`, per-field limits, sources).
- On every load the app **fetches `./seo-rules.json` cache-busted** (`?t=…`), so the deployed site always uses the newest pushed file. If the fetch fails it falls back to built-in defaults and says so in the UI.
- The header shows **rules version, updated date, source, and staleness** (>90 days → warning), plus a **Refresh rules** button.
- **To update the rules:** edit `seo-rules.json`, bump `version`/`updated`, push. Pages redeploys and every visitor gets the new thresholds — no code changes.
- Optional power feature: paste any hosted JSON URL (gist, another repo) under **Custom rules URL**, or append `?rules=https://…/seo-rules.json` to the page URL. Stored only in that browser.

## Automated freshness monitoring (the "always up to date" part)

Google publishes no numeric SEO-rules API, so no static site can safely auto-rewrite thresholds — the docs are qualitative and need human judgment. What *is* automated here is the detection half:

- `.github/workflows/seo-rules-monitor.yml` runs **monthly** (plus on-demand via **Run workflow**). It runs `.github/scripts/check_seo_sources.py`, which fetches every URL in `seo-rules.json → sources`, hashes the main content, and compares it against `.seo-sources/snapshot.json`.
- **Sources unchanged** → the workflow stamps `lastChecked` with that day's date and pushes. The app header then reads "sources verified YYYY-MM-DD" — that stamp is your proof the rules were re-confirmed.
- **Sources changed** → the workflow sets `reviewNeeded: true`, records which URLs changed, and opens (or updates) a `seo-rules-review` issue containing the check report. The app shows a "thresholds under review" warning until a human revises the thresholds and bumps `version`/`updated`.
- Enable it by pushing these files with **Actions enabled** in the repo (scheduled workflows run on the default branch). Test it anytime with **Actions → SEO rules freshness monitor → Run workflow`​**.

Rule sources tracked in the file: Google Search Essentials / title-link / snippet docs. Re-check them when bumping the file.
Rules last cross-checked against sources: **2026-10-04** (version `2026.10.04-r2`). The app flags the rules as stale 90 days after the `updated` date — treat that as your prompt to re-verify.

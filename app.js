/* SEO Article Review — 100% client-side, GitHub Pages safe (no build step). */
"use strict";

const $ = (id) => document.getElementById(id);
const els = {
  keyphrase: $("in-keyphrase"), title: $("in-title"), summary: $("in-summary"),
  excerpt: $("in-excerpt"), body: $("in-body"),
  checks: $("checks"), suggestions: $("suggestions"), stats: $("stats"),
  scoreNum: $("scoreNum"), dial: $("dial"), verdict: $("verdict"), scoreHint: $("scoreHint"),
  rulesDot: $("rulesDot"), rulesStatus: $("rulesStatus"), rulesMeta: $("rulesMeta"),
  customUrl: $("customRulesUrl"),
};
const LS_DRAFT = "seo-review-draft-v1";
const LS_CUSTOM_RULES = "seo-review-rules-url";

/* ---------- Built-in fallback rules (used only if live file can't load) ---------- */
const FALLBACK_RULES = {
  version: "built-in fallback",
  updated: "2026-10-04",
  lastChecked: null,
  reviewNeeded: false,
  changedSources: [],
  sources: ["https://developers.google.com/search/docs/fundamentals/seo-starter-guide"],
  refresh: { staleAfterDays: 90 },
  rules: {
    title: { minChars: 40, maxChars: 60, hardMaxChars: 70, rewriteSafeMin: 51, rewriteSafeMax: 55, keywordAtStartMaxPos: 15 },
    summary: { minChars: 120, maxChars: 155, hardMaxChars: 170 },
    excerpt: { minChars: 80, maxChars: 160, hardMaxChars: 200 },
    body: { minWords: 300, goodWords: 1000, minParagraphs: 3, maxSentenceWords: 25, longSentenceShareWarn: 0.25, maxParagraphWords: 120, keywordDensityMin: 0.005, keywordDensityMax: 0.025, keywordDensityGoodMax: 0.02, firstKeywordWithinWords: 100, minH2: 1, h2EveryWords: 350, minInternalLinks: 1, minExternalLinks: 1, transitionWordsMinShare: 0.2, passiveVoiceMaxShare: 0.15 },
    readability: { fleschGood: 60, fleschOkay: 40 },
  },
  powerWords: ["ultimate", "proven", "essential", "complete", "best", "guide", "how", "why", "new", "free", "easy", "fast", "secret", "top"],
};

let RULES = FALLBACK_RULES;
let rulesSourceLabel = "built-in fallback";

/* ---------- Live rules loading ---------- */
function rulesCandidates() {
  const out = [];
  const param = new URLSearchParams(location.search).get("rules");
  const saved = localStorage.getItem(LS_CUSTOM_RULES);
  if (param) out.push({ url: param, label: "custom ?rules= URL" });
  if (saved) out.push({ url: saved, label: "custom URL (saved)" });
  out.push({ url: "./seo-rules.json", label: "live seo-rules.json" });
  return out;
}

async function loadRules() {
  setRulesUI("loading", "Loading SEO rules…", "");
  for (const c of rulesCandidates()) {
    try {
      const bust = (RULES?.refresh?.cacheBust !== false) ? ((c.url.includes("?") ? "&" : "?") + "t=" + Date.now()) : "";
      // Don't cache-bust custom URLs aggressively — still fine with one param.
      const res = await fetch(c.url + (c.url.startsWith("./") ? bust : ""), { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      if (!json || !json.rules) continue;
      RULES = json;
      rulesSourceLabel = c.label;
      setRulesUI("ok", `SEO rules v${json.version || "?"} loaded live`, rulesMetaHTML(json, c.label));
      analyze();
      return;
    } catch { /* try next */ }
  }
  RULES = FALLBACK_RULES;
  rulesSourceLabel = "built-in fallback (live file unreachable)";
  setRulesUI("bad", "Live rules unreachable — using built-in fallback", `Checked ${rulesCandidates().map(c => c.label).join(" → ")}. Add <code>seo-rules.json</code> next to <code>index.html</code> when hosting.`);
  analyze();
}

function rulesMetaHTML(json, label) {
  const staleDays = (json.refresh && json.refresh.staleAfterDays) || 90;
  const age = json.updated ? Math.floor((Date.now() - new Date(json.updated + "T00:00:00Z").getTime()) / 864e5) : NaN;
  const stale = !isNaN(age) && age > staleDays;
  if (stale || json.reviewNeeded) setRulesUI("warn");
  const src = (json.sources || []).slice(0, 2).map(s => `<a href="${s}" target="_blank" rel="noopener">source</a>`).join(" · ");
  const verified = json.lastChecked ? ` · sources verified ${esc(json.lastChecked)}` : "";
  const review = json.reviewNeeded
    ? ` · <b>upstream guidance changed — thresholds under review${json.changedSources && json.changedSources.length ? " (" + json.changedSources.length + " source" + (json.changedSources.length > 1 ? "s" : "") + ")" : ""}</b>`
    : "";
  return `Source: ${label} · updated ${json.updated || "unknown"}${!isNaN(age) ? ` (${age}d ago${stale ? " — stale, refresh due" : ""})` : ""}${verified}${review}${src ? " · " + src : ""}`;
}

function setRulesUI(state, status, meta) {
  els.rulesDot.className = "dot" + (state === "ok" ? " ok" : state === "bad" ? " bad" : "");
  if (status) els.rulesStatus.textContent = status;
  if (meta !== undefined) els.rulesMeta.innerHTML = meta;
}

/* ---------- Text utilities ---------- */
const stripMdHtml = (s) => (s || "")
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
  .replace(/[#>*_`~|-]/g, " ")
  .replace(/https?:\/\/\S+/g, " ")
  .replace(/\s+/g, " ").trim();

const words = (s) => { const t = stripMdHtml(s); return t ? t.split(/\s+/) : []; };
const sentencesOf = (s) => (stripMdHtml(s).match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || []).map(x => x.trim()).filter(Boolean);
const countSyllables = (w) => {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const m = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, (m || []).length);
};
const flesch = (text) => {
  const ws = words(text), ss = sentencesOf(text);
  if (ws.length < 30 || ss.length === 0) return null;
  const syl = ws.reduce((a, w) => a + countSyllables(w), 0);
  return 206.835 - 1.015 * (ws.length / ss.length) - 84.6 * (syl / ws.length);
};
const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function parseHeadings(raw) {
  const out = [];
  for (const m of (raw || "").matchAll(/^#{1,6}\s+(.+)$/gm)) out.push({ level: m[0].match(/^#+/)[0].length, text: m[1].trim() });
  for (const m of (raw || "").matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi)) out.push({ level: +m[1], text: m[2].replace(/<[^>]+>/g, "").trim() });
  return out;
}
function parseLinks(raw) {
  const links = [];
  for (const m of (raw || "").matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) links.push(m[2].trim());
  for (const m of (raw || "").matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)) links.push(m[1].trim());
  for (const m of (raw || "").matchAll(/(^|\s)(https?:\/\/[^\s)>\]]+)/g)) links.push(m[2].trim());
  const seen = new Set(), uniq = [];
  for (const l of links) { if (!seen.has(l)) { seen.add(l); uniq.push(l); } }
  const internal = uniq.filter(h => h.startsWith("/") || h.startsWith("#"));
  const external = uniq.filter(h => /^https?:\/\//i.test(h));
  return { all: uniq, internal, external };
}
const TRANSITIONS = ["however", "therefore", "for example", "in addition", "moreover", "meanwhile", "consequently", "instead", "although", "because", "finally", "first", "second", "also", "but", "so", "then", "furthermore", "overall", "in contrast", "on the other hand"];
const transitionShare = (text) => {
  const ss = sentencesOf(text);
  if (!ss.length) return 0;
  const hit = ss.filter(s => TRANSITIONS.some(t => new RegExp(`\\b${t}\\b`, "i").test(s))).length;
  return hit / ss.length;
};
const passiveShare = (text) => {
  const ss = sentencesOf(text);
  if (!ss.length) return 0;
  const re = /\b(am|is|are|was|were|be|been|being)\b\s+(\w+ed\b|\w+en\b|built|written|made|done|taken|given|shown|found|known|thought|said)/i;
  return ss.filter(s => re.test(s)).length / ss.length;
};
const keywordCount = (text, kw) => {
  if (!kw) return 0;
  const t = stripMdHtml(text).toLowerCase(), k = kw.toLowerCase().trim();
  if (!k) return 0;
  return t.split(k).length - 1;
};

/* ---------- Analysis (driven by live RULES) ---------- */
let lastReport = null;

function analyze() {
  const R = RULES.rules;
  const kw = els.keyphrase.value.trim();
  const title = els.title.value, summary = els.summary.value,
        excerpt = els.excerpt.value, body = els.body.value;
  const checks = [];
  const add = (id, status, titleT, detail, weight) => checks.push({ id, status, title: titleT, detail, weight: weight ?? 1 });

  /* Title */
  const tl = title.trim().length;
  updateMeter("title", tl, R.title.minChars, R.title.maxChars, R.title.hardMaxChars, title.trim() ? null : "Add a title to get feedback.");
  if (!title.trim()) add("title", "skip", "Title: empty (optional)", "Titles around 40–60 characters earn the full snippet in Google. Add one when ready.", 0);
  else {
    if (tl < R.title.minChars) add("title-len", "warn", `Title too short (${tl} chars)`, `Aim for ${R.title.minChars}–${R.title.maxChars} characters so it carries a promise + keyword. Currently too thin to compete.`, 2);
    else if (tl <= R.title.maxChars) {
      const sweet = R.title.rewriteSafeMin && R.title.rewriteSafeMax && tl >= R.title.rewriteSafeMin && tl <= R.title.rewriteSafeMax;
      add("title-len", "pass", `Title length looks good (${tl} chars)`,
        sweet ? "Fits the snippet and sits in the 51–55 zone with the lowest Google rewrite rate."
              : "Fits the search snippet without truncation. (51–55 chars has the lowest rewrite rate.)", 2);
    }
    else if (tl <= R.title.hardMaxChars) add("title-len", "warn", `Title may truncate (${tl} chars)`, `Google typically shows ~60 characters. Trim to under ${R.title.maxChars} so the key promise survives.`, 2);
    else add("title-len", "fail", `Title will truncate (${tl} chars)`, `Over ${R.title.hardMaxChars} characters — rewrite shorter. Put the keyphrase and hook first.`, 2);

    if (kw) {
      const pos = title.toLowerCase().indexOf(kw.toLowerCase());
      if (pos === -1) add("title-kw", "fail", "Title: missing keyphrase", `Add “${kw}” naturally, ideally within the first ${R.title.keywordAtStartMaxPos} characters.`, 2);
      else if (pos <= R.title.keywordAtStartMaxPos) add("title-kw", "pass", "Title: keyphrase up front", "Good — crawlers and skimmers see the topic immediately.", 2);
      else add("title-kw", "warn", "Title: keyphrase buried", `Found at character ${pos + 1}. Move “${kw}” closer to the front.`, 2);
    } else add("title-kw", "skip", "Title: no keyphrase set", "Add a focus keyphrase above to unlock keyword placement checks.", 0);

    const hasPower = (RULES.powerWords || []).some(p => new RegExp(`\\b${p}\\b`, "i").test(title));
    const hasNum = /\d/.test(title);
    if (hasPower || hasNum) add("title-hook", "pass", "Title has a hook", `${[hasNum && "number", hasPower && "power word"].filter(Boolean).join(" + ")} detected — good for click-through.`, 1);
    else add("title-hook", "warn", "Title could hook harder", "Consider a number, a power word (e.g. “proven”, “complete”, “how”) or a clear benefit to stand out in the SERP.", 1);
    if (/[A-Z]{4,}/.test(title)) add("title-caps", "warn", "Title: avoid ALL-CAPS stretches", "Full caps looks spammy and can hurt CTR.", 0.5);
  }

  /* Summary (meta description role) */
  const sl = summary.trim().length;
  updateMeter("summary", sl, R.summary.minChars, R.summary.maxChars, R.summary.hardMaxChars, summary.trim() ? null : "Empty — will show here once you draft it.");
  if (!summary.trim()) add("summary", "skip", "Summary: empty (optional)", `Summaries of ${R.summary.minChars}–${R.summary.maxChars} characters double as the Google meta description. Draft one when ready.`, 0);
  else {
    if (sl < R.summary.minChars) add("summary-len", "warn", `Summary short (${sl} chars)`, `Expand toward ${R.summary.minChars}–${R.summary.maxChars} characters with a benefit + reason to click. Thin snippets get rewritten by Google.`, 2);
    else if (sl <= R.summary.maxChars) add("summary-len", "pass", `Summary length good (${sl} chars)`, "Sits inside the snippet window.", 2);
    else if (sl <= R.summary.hardMaxChars) add("summary-len", "warn", `Summary may truncate (${sl} chars)`, `Trim to ~${R.summary.maxChars} so the call-to-action survives.`, 2);
    else add("summary-len", "fail", `Summary too long (${sl} chars)`, "Will be cut off. Keep the keyphrase + one promise + one CTA.", 2);
    if (kw) {
      add(...kwCheck(summary, kw, "summary-kw", "Summary", 1.5));
    }
  }

  /* Excerpt */
  const exl = excerpt.trim().length;
  updateMeter("excerpt", exl, R.excerpt.minChars, R.excerpt.maxChars, R.excerpt.hardMaxChars, excerpt.trim() ? null : "Empty — teasers show on cards & newsletters.");
  if (!excerpt.trim()) add("excerpt", "skip", "Excerpt: empty (optional)", "A 1–2 line teaser lifts click-through on listing pages. Optional but cheap to add.", 0);
  else {
    if (exl < R.excerpt.minChars) add("excerpt-len", "warn", `Excerpt short (${exl} chars)`, `Flesh it toward ${R.excerpt.minChars}–${R.excerpt.maxChars} characters with a concrete hook.`, 1);
    else if (exl <= R.excerpt.maxChars) add("excerpt-len", "pass", `Excerpt length good (${exl} chars)`, "Snappy enough for cards and feeds.", 1);
    else add("excerpt-len", "warn", `Excerpt long (${exl} chars)`, "May get cut on cards — keep the hook in the first ~120 characters.", 1);
    if (kw) add(...kwCheck(excerpt, kw, "excerpt-kw", "Excerpt", 1));
    if (summary.trim() && stripMdHtml(summary).toLowerCase() === stripMdHtml(excerpt).toLowerCase())
      add("excerpt-dup", "warn", "Excerpt duplicates summary", "Differentiate them: summary = what the article delivers (SEO), excerpt = why to click now (tease).", 1);
  }

  /* Body */
  const bw = words(body).length;
  const empty = bw === 0;
  updateMeter("body", bw, R.body.minWords, R.body.goodWords, R.body.goodWords * 1.5, empty ? "Paste your draft to get body feedback." : null);
  if (empty) add("body", "skip", "Article: empty (optional)", "Paste a draft — word count, headings, links, keyword use and readability appear here live.", 0);
  else {
    if (bw < R.body.minWords) add("body-len", "fail", `Article thin (${bw} words)`, `Under ${R.body.minWords} words rarely covers a topic competitively. Expand with examples, steps, or FAQs.`, 3);
    else if (bw < R.body.goodWords) add("body-len", "warn", `Article decent (${bw} words)`, `Over ${R.body.goodWords} words with real depth tends to compete better. Add sections, data, or examples — not filler.`, 3);
    else add("body-len", "pass", `Article depth good (${bw} words)`, "Length supports topical coverage. Keep it scannable (headings, short paragraphs).", 3);

    const paras = body.split(/\n\s*\n/).filter(p => stripMdHtml(p).split(/\s+/).length > 2);
    if (paras.length < R.body.minParagraphs) add("body-para", "warn", "Few paragraphs", "Break the draft into short paragraphs — walls of text hurt dwell time.", 1);
    const longParas = paras.filter(p => words(p).length > R.body.maxParagraphWords).length;
    if (longParas > 0) add("body-paralen", "warn", `${longParas} long paragraph${longParas > 1 ? "s" : ""}`, `Keep paragraphs under ~${R.body.maxParagraphWords} words for skimmers.`, 1);

    const ss = sentencesOf(body);
    const longS = ss.filter(s => s.split(/\s+/).length > R.body.maxSentenceWords);
    if (ss.length && longS.length / ss.length > R.body.longSentenceShareWarn)
      add("body-sent", "warn", `${Math.round(longS.length / ss.length * 100)}% long sentences`, `Over ${R.body.maxSentenceWords} words per sentence strains readers. Split the longest ${Math.min(3, longS.length)} — see suggestions.`, 1.5);
    else if (ss.length) add("body-sent", "pass", "Sentence length fine", "Readable rhythm for skimmers.", 1);

    const heads = parseHeadings(body);
    const h2s = heads.filter(h => h.level <= 2);
    if (h2s.length < R.body.minH2) add("body-h", "warn", "No clear sections", "Add ## subheadings with keyword variants — they structure snippets and featured answers.", 2);
    else {
      const need = Math.max(R.body.minH2, Math.floor(bw / R.body.h2EveryWords));
      if (h2s.length >= need) add("body-h", "pass", `${h2s.length} section headings`, "Good structure for skimmers and crawlers.", 2);
      else add("body-h", "warn", `Only ${h2s.length} section heading${h2s.length > 1 ? "s" : ""}`, `For ~${bw} words aim for ~${need}. Each H2 should promise one answer.`, 2);
    }
    if (heads.some(h => h.level === 1) || /^#\s/m.test(body)) add("body-h1", "warn", "Avoid H1 inside the body", "Your title is the H1 — start body sections at ##.", 0.5);

    const { internal, external } = parseLinks(body);
    if (internal.length < R.body.minInternalLinks) add("body-il", "warn", "No internal links detected", "Link to 1–2 related posts/pages — it distributes authority and keeps readers around.", 1.5);
    else add("body-il", "pass", `${internal.length} internal link${internal.length > 1 ? "s" : ""}`, "Good for crawl depth and sessions.", 1.5);
    if (external.length < R.body.minExternalLinks) add("body-el", "warn", "No external citations", "Cite 1+ authoritative source — it grounds claims and matches what rankers do.", 1);
    else add("body-el", "pass", `${external.length} external citation${external.length > 1 ? "s" : ""}`, "Good — keep links relevant and fresh.", 1);

    if (kw) {
      const dens = bw ? keywordCount(body, kw) / bw : 0;
      const occ = keywordCount(body, kw);
      if (occ === 0) add("body-kw", "fail", "Keyphrase missing from body", `Use “${kw}” (and natural variants) in the intro, a heading, and the conclusion.`, 2.5);
      else if (dens < R.body.keywordDensityMin) add("body-kw", "warn", `Keyphrase rare (${(dens * 100).toFixed(1)}% density, ${occ}×)`, "Weave it in a few more times naturally — intro, one H2, body, conclusion.", 2.5);
      else if (dens <= R.body.keywordDensityGoodMax) add("body-kw", "pass", `No exact-match stuffing (${(dens * 100).toFixed(1)}%, ${occ}×)`, "Repetition looks natural. Note: Google doesn't use density as a ranking factor — this is just an over-repetition check.", 2.5);
      else if (dens <= R.body.keywordDensityMax) add("body-kw", "warn", `Keyphrase slightly heavy (${(dens * 100).toFixed(1)}%)`, "Vary with synonyms/pronouns — Google flags unnatural repetition, not a number.", 2.5);
      else add("body-kw", "fail", `Possible keyword stuffing (${(dens * 100).toFixed(1)}%, ${occ}×)`, "Rewrite with pronouns/synonyms. If it sounds forced read aloud, cut it.", 2.5);

      const firstPos = stripMdHtml(body).toLowerCase().indexOf(kw.toLowerCase());
      const wordsBefore = firstPos === -1 ? Infinity : stripMdHtml(body).slice(0, firstPos).split(/\s+/).filter(Boolean).length;
      if (firstPos !== -1 && wordsBefore <= R.body.firstKeywordWithinWords) add("body-intro", "pass", "Keyphrase in intro", `First use within the first ${R.body.firstKeywordWithinWords} words — good topical signal.`, 1.5);
      else if (firstPos !== -1) add("body-intro", "warn", "Keyphrase starts late", `First use is ~${wordsBefore} words in. State the topic within the first ${R.body.firstKeywordWithinWords} words.`, 1.5);

      const inHead = heads.some(h => h.text.toLowerCase().includes(kw.toLowerCase()));
      add("body-hkw", inHead ? "pass" : "warn", inHead ? "Keyphrase in a heading" : "No heading contains keyphrase",
        inHead ? "Nice — reinforces structure." : `Work “${kw}” (or a variant) into one ## heading.`, 1);
    } else add("body-kw", "skip", "Body: no keyphrase set", "Set a focus keyphrase to check density, intro and heading usage.", 0);

    const f = flesch(body);
    if (f === null) add("body-read", "skip", "Readability: need more text", "Flesch score appears after ~30 words.", 0);
    else if (f >= R.readability.fleschGood) add("body-read", "pass", `Readable (Flesch ${Math.round(f)})`, "Plain language — good for broad audiences.", 1);
    else if (f >= R.readability.fleschOkay) add("body-read", "warn", `Fairly dense (Flesch ${Math.round(f)})`, "Shorten sentences, swap jargon for plain words.", 1);
    else add("body-read", "fail", `Hard to read (Flesch ${Math.round(f)})`, "Break up sentences, use lists and headings. See suggestions.", 1);

    const ts = transitionShare(body);
    if (ss.length > 4) add("body-trans", ts >= R.body.transitionWordsMinShare ? "pass" : "warn",
      `Transition words in ${Math.round(ts * 100)}% of sentences`,
      ts >= R.body.transitionWordsMinShare ? "Good flow." : "Add connectors (however, for example, finally…) to carry readers through.", 0.5);
    const pv = passiveShare(body);
    if (ss.length > 4) add("body-passive", pv <= R.body.passiveVoiceMaxShare ? "pass" : "warn",
      `Passive voice ~${Math.round(pv * 100)}%`,
      pv <= R.body.passiveVoiceMaxShare ? "Active voice dominates." : "Prefer active verbs (“we tested” over “was tested”).", 0.5);
  }

  render(checks, { kw, title, summary, excerpt, body });
}

function kwCheck(text, kw, id, label, weight) {
  const has = stripMdHtml(text).toLowerCase().includes(kw.toLowerCase());
  return [id, has ? "pass" : "warn", has ? `${label}: keyphrase present` : `${label}: missing keyphrase`,
    has ? "Good — reinforces the topic." : `Weave “${kw}” in naturally, near the front.`, weight];
}

/* ---------- Meters / rendering / score ---------- */
function updateMeter(field, value, min, good, hardMax, emptyMsg) {
  const bar = $("bar-" + field), msg = $("msg-" + field), count = $("c-" + field);
  const unit = field === "body" ? "w" : "ch";
  count.textContent = value + " " + unit;
  const pct = hardMax ? Math.min(100, Math.round(value / hardMax * 100)) : 0;
  bar.style.width = pct + "%";
  bar.style.background = !value ? "#2c3d52" : value < min ? "var(--warn)" : value <= good ? "var(--accent)" : value <= hardMax ? "var(--warn)" : "var(--fail)";
  if (emptyMsg) { msg.textContent = emptyMsg; msg.className = "field-msg"; }
  else if (value < min) { msg.textContent = `${min - value} ${unit} short of the ${min} minimum.`; msg.className = "field-msg warn"; }
  else if (value <= good) { msg.textContent = "In the ideal range."; msg.className = "field-msg ok"; }
  else { msg.textContent = `Over by ${value - good} ${unit} — trim to avoid truncation.`; msg.className = "field-msg warn"; }
  if (field === "keyphrase") count.textContent = "";
}

function render(checks, vals) {
  const scored = checks.filter(c => c.status !== "skip" && c.weight > 0);
  const pts = { pass: 1, warn: 0.45, fail: 0 };
  const got = scored.reduce((a, c) => a + (pts[c.status] ?? 0) * c.weight, 0);
  const max = scored.reduce((a, c) => a + c.weight, 0) || 1;
  const score = max === 1 && scored.length === 0 ? null : Math.round(got / max * 100);
  lastReport = { score, checks, vals, rulesVersion: RULES.version, rulesUpdated: RULES.updated, at: new Date().toISOString() };

  els.scoreNum.textContent = score === null ? "–" : score;
  els.dial.style.setProperty("--p", score ?? 0);
  els.dial.style.background = `conic-gradient(${score == null ? "#2c3d52" : score >= 80 ? "var(--accent)" : score >= 55 ? "var(--warn)" : "var(--fail)"} ${(score ?? 0)}%, #0c1219 0)`;
  els.verdict.textContent = score === null ? "Start typing…" :
    score >= 80 ? "Strong — ready to publish" : score >= 55 ? "Close — fix the warnings" : "Needs work — see suggestions";
  els.scoreHint.textContent = score === null ? "Your overall SEO readiness appears here. Every check below updates as you type."
    : `Based on SEO rules v${RULES.version || "?"} (${RULES.updated || "undated"}) · ${scored.filter(c => c.status === "pass").length}/${scored.length} checks passing.`;

  els.checks.innerHTML = checks.map(c =>
    `<li><b><span class="badge ${c.status}">${c.status}</span>${esc(c.title)}</b><p>${esc(c.detail)}</p></li>`).join("")
    || `<li><p class="hint">No checks yet.</p></li>`;

  renderSuggestions(vals);
  const writing = renderWriting(vals.body);
  renderStats(vals, writing.grade);

  clearTimeout(render._t);
  render._t = setTimeout(saveDraft, 300);
}

function smartTrim(s, max) {
  s = (s || "").trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[,:;\-.!?]+$/, "") + "…";
}

function suggestTitle(title, kw) {
  const R = RULES.rules.title;
  let t = title.trim().replace(/\s+/g, " ");
  const hasKw = kw && t.toLowerCase().includes(kw.toLowerCase());
  if (kw && !hasKw) t = `${kw[0].toUpperCase() + kw.slice(1)}: ${t}`.replace(/^:+/, "");
  if (!/\d/.test(t) && t) t = t; // don't force numbers; flag only
  if (t.length > R.maxChars) t = smartTrim(t, R.maxChars);
  return t;
}

function renderSuggestions({ kw, title, summary, excerpt, body }) {
  const out = [];
  const push = (h, why, text) => { if (text) out.push({ h, why, text }); };
  const R = RULES.rules;

  if (title.trim()) {
    const fixed = suggestTitle(title, kw);
    if (fixed !== title.trim())
      push("Title rewrite", `Fits ${R.title.minChars}–${R.title.maxChars} chars${kw ? " with the keyphrase up front" : ""}.`, fixed);
    else if (title.trim().length < R.title.minChars)
      push("Title idea", "Too short to compete — add a promise or scope.", `${title.trim()} — what you get and who it's for`.slice(0, R.title.maxChars));
  }
  if (summary.trim() || title.trim()) {
    const base = summary.trim() || `${stripMdHtml(body).split(/\s+/).slice(0, 24).join(" ")}…`;
    let s = base;
    if (kw && !base.toLowerCase().includes(kw.toLowerCase()) && kw) s = `${kw[0].toUpperCase() + kw.slice(1)} — ${s}`;
    s = smartTrim(s, R.summary.maxChars);
    if (!/[.!?……]$/.test(s) && s.length > 40) s = s.replace(/…$/, "") + ".";
    if (s && s !== summary.trim()) push("Summary rewrite (meta description)", `~${R.summary.minChars}–${R.summary.maxChars} chars, keyphrase + benefit + reason to click.`, s);
  }
  if (excerpt.trim() && summary.trim() && stripMdHtml(excerpt).toLowerCase() === stripMdHtml(summary).toLowerCase())
    push("Excerpt rewrite (de-duplicate)", "Don't repeat the summary — tease instead.", smartTrim("Inside: " + excerpt.trim().replace(/^inside:\s*/i, ""), R.excerpt.maxChars));
  else if (excerpt.trim() && excerpt.trim().length > R.excerpt.maxChars)
    push("Excerpt trim", "Keep the hook inside the card cutoff.", smartTrim(excerpt.trim(), R.excerpt.maxChars));

  const bw = words(body).length;
  if (bw > 0) {
    const heads = parseHeadings(body);
    if (!heads.some(h => h.level <= 2))
      push("Structure fix", "Add scannable sections — each H2 answers one question.",
        "## What it is\n## Why it matters\n## How to do it\n## Mistakes to avoid\n## FAQ");
    if (kw && !heads.some(h => h.text.toLowerCase().includes(kw.toLowerCase())))
      push("Heading idea", "Give crawlers one keyword-bearing H2.", `## ${kw[0]?.toUpperCase() + kw.slice(1) || "Key topic"}: what to know`);
    const { internal, external } = parseLinks(body);
    if (!internal.length) push("Internal link idea", "Keeps readers + authority in your cluster.", "Link a phrase to 1–2 related posts (e.g. “see our [beginner's guide](/… )”).");
    if (!external.length) push("Citation idea", "Ground one claim with a source.", "Cite one authoritative page: [source name](https://…) near your strongest claim.");
    const longS = sentencesOf(body).filter(s => s.split(/\s+/).length > R.body.maxSentenceWords).slice(0, 2);
    longS.forEach((s, i) => push(`Split long sentence ${i + 1}`, `Over ${R.body.maxSentenceWords} words — split at the comma/and.`, smartTrim(s, 140)));
    const f = flesch(body);
    if (f !== null && f < RULES.rules.readability.fleschOkay)
      push("Readability fix", `Flesch ${Math.round(f)} is dense — prefer short sentences and plain verbs.`, "Rewrite one paragraph with 15-word sentences, active verbs, and a list.");
  }

  els.suggestions.innerHTML = out.length ? out.map((s, i) =>
    `<div class="sug"><h4>${esc(s.h)}</h4><p class="hint">${esc(s.why)}</p><blockquote>${esc(s.text)}</blockquote><button class="btn small copy" data-i="${i}" type="button">Copy</button></div>`).join("")
    : `<p class="hint">Suggestions will appear here once there is something to review.</p>`;
  els.suggestions.querySelectorAll(".copy").forEach(b => b.addEventListener("click", () => {
    navigator.clipboard.writeText(out[+b.dataset.i].text).then(() => { b.textContent = "Copied!"; setTimeout(() => b.textContent = "Copy", 1200); });
  }));
  els.suggestions._data = out;
}

function renderStats({ kw, title, summary, excerpt, body }, grade) {
  const bw = words(body).length;
  const dens = kw && bw ? (keywordCount(body, kw) / bw * 100) : null;
  const f = flesch(body);
  const { internal, external } = parseLinks(body);
  const rows = [
    ["Focus keyphrase", kw ? esc(kw) + ` · ${keywordCount(title + " " + summary + " " + body, kw)}× total` : "<span class='hint'>not set</span>"],
    ["Words", `${bw} · ${sentencesOf(body).length} sentences · ${parseHeadings(body).filter(h => h.level <= 2).length} H2s`],
    ["Keyword repetition (body)", dens === null ? "<span class='hint'>—</span>" : `${dens.toFixed(1)}% exact-match (over ~${(RULES.rules.body.keywordDensityGoodMax * 100).toFixed(0)}% = review for stuffing; density itself is not a ranking factor)`],
    ["Readability", f === null ? "<span class='hint'>need ~30+ words</span>" : `Flesch ${Math.round(f)} (${f >= RULES.rules.readability.fleschGood ? "good" : f >= RULES.rules.readability.fleschOkay ? "okay" : "dense"})` + (grade !== null && grade !== undefined ? ` · grade ~${Math.max(1, Math.round(grade))} · ${Math.max(1, Math.round(bw / 200))} min read` : "")],
    ["Links", `${internal.length} internal · ${external.length} external`],
    ["Rules", `v${esc(RULES.version || "?")} · thresholds ${esc(RULES.updated || "?")} · sources verified ${esc(RULES.lastChecked || "never")}${RULES.reviewNeeded ? " · <b>REVIEW NEEDED</b>" : ""}`],
  ];
  els.stats.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

/* ---------- Writing assistant (Grammarly-style, fully client-side) ----------
   What this covers (rule-based, no server): Correctness (typos, repeated
   words, spacing, sentence case, "should of"→"should have"), Clarity (wordy
   phrases with one-click fixes, qualifiers), Engagement (weak words with
   stronger alternatives, sentence variety), Delivery (hedging, casual slang,
   tone meter). Deliberately NOT included: plagiarism checking and AI
   full-sentence rewrites — both need a web service, which would break the
   "nothing leaves your browser" guarantee. */
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cap1 = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
// Whole-phrase, case-insensitive matcher on the raw draft (markdown-safe: these are all plain words).
const phraseMatches = (text, phrase) => {
  const out = [];
  const re = new RegExp("\\b" + escRe(phrase) + "\\b", "gi");
  let m;
  while ((m = re.exec(text)) !== null) { out.push(m[0]); if (out.length > 40) break; }
  return out;
};

const WORDY_FIXES = [ // [wordy phrase, concise replacement]
  ["due to the fact that", "because"], ["in order to", "to"],
  ["in spite of the fact that", "although"], ["in the event that", "if"],
  ["at this point in time", "now"], ["in the near future", "soon"],
  ["are able to", "can"], ["is able to", "can"],
  ["has the ability to", "can"], ["have the ability to", "can"],
  ["a large number of", "many"], ["a wide variety of", "many"], ["a variety of", "several"],
  ["first and foremost", "first"], ["each and every", "every"],
  ["in today's world", "today"], ["close proximity", "close by"],
  ["general consensus of opinion", "consensus"], ["general consensus", "consensus"],
  ["free gift", "gift"], ["past history", "history"], ["future plans", "plans"],
  ["end result", "result"], ["added bonus", "bonus"],
  ["absolutely essential", "essential"], ["basic fundamentals", "fundamentals"],
  ["could possibly", "could"], ["might possibly", "might"], ["very unique", "unique"],
];
const TYPO_FIXES = { // common misspellings -> correction (whole word, case preserved)
  alot: "a lot", teh: "the", wich: "which", recieve: "receive", seperate: "separate",
  definately: "definitely", neccessary: "necessary", occured: "occurred",
  occurance: "occurrence", untill: "until", goverment: "government",
  enviroment: "environment", calender: "calendar", accomodate: "accommodate",
  noticable: "noticeable", tommorow: "tomorrow", writting: "writing",
  begining: "beginning", arguement: "argument", suprise: "surprise",
};
const GRAMMAR_FIXES = [ // deterministic grammar slips
  ["should of", "should have"], ["could of", "could have"], ["would of", "would have"],
  ["must of", "must have"], ["might of", "might have"], ["your welcome", "you're welcome"],
];
const VERY_MAP = { // "very + weak adjective" -> single stronger word
  "very good": "excellent", "very bad": "terrible", "very big": "huge", "very small": "tiny",
  "very fast": "rapid", "very important": "crucial", "very clear": "obvious",
  "very sure": "certain", "very tired": "exhausted", "very happy": "delighted",
};
const WEAK_ALTS = { // vague words -> stronger options (shown, not auto-applied)
  good: ["strong", "solid", "compelling"], bad: ["poor", "weak", "flawed"],
  nice: ["memorable", "refined", "pleasant"], big: ["major", "substantial"],
  small: ["minor", "modest"], "a lot": ["many", "much"],
  thing: ["name the specifics"], things: ["name the specifics"], stuff: ["details", "material"],
};
const HEDGES = ["in my opinion", "i think", "i believe", "sort of", "kind of", "perhaps", "possibly"];
const QUALIFIERS = ["really", "just", "quite", "rather"];
const CASUAL = ["gonna", "wanna", "kinda", "yeah", "cool", "awesome", "dumb"];

let currentWritingFixes = [];

function analyzeWriting(body) {
  const issues = [];
  const push = (cat, title, detail, fix) => { if (issues.length < 100) issues.push({ cat, title, detail, fix }); };

  // Correctness: typos + grammar slips (one-click fix each)
  for (const [wrong, right] of Object.entries(TYPO_FIXES))
    for (const m of phraseMatches(body, wrong))
      push("Correctness", `Spelling: “${m}”`, `Usually spelled “${/^[A-Z]/.test(m) ? cap1(right) : right}”.`,
        { find: m, replace: /^[A-Z]/.test(m) ? cap1(right) : right });
  for (const [wrong, right] of GRAMMAR_FIXES)
    for (const m of phraseMatches(body, wrong))
      push("Correctness", `Grammar: “${m}”`, `The standard form is “${right}”.`, { find: m, replace: right });

  // Correctness: repeated word ("the the") — fix removes the duplicate.
  for (const m of (body.match(/\b([A-Za-z']+)\s+\1\b/gi) || []).slice(0, 10)) {
    const word = m.split(/\s+/)[0];
    push("Correctness", `Repeated word: “${m.trim()}”`, "Almost always a typo — keep one.",
      { find: m, replace: /^[A-Z]/.test(m) ? cap1(word.toLowerCase()) : word.toLowerCase() });
  }
  // Correctness: spacing slips (apply to all at once).
  const dbl = (body.match(/ {2,}/g) || []).length;
  if (dbl) push("Correctness", `${dbl} double space${dbl > 1 ? "s" : ""}`, "Clean up extra spacing in one click.", { find: "  ", replace: " ", all: true });
  const prePunct = (body.match(/ +([,.!?;:])/g) || []).length;
  if (prePunct) push("Correctness", "Space before punctuation", "Punctuation attaches to the previous word.", { find: "SPACE_BEFORE_PUNCT", replace: "", all: true, special: "prepunct" });
  // Correctness: sentence starts with lowercase (one-click capitalize, first few).
  for (const m of (body.match(/[.!?…]\s+[a-z]/g) || []).slice(0, 5)) {
    const letter = m.slice(-1);
    push("Correctness", "Sentence starts lowercase", `“…${m.trim()}” — capitalize “${letter}”.`,
      { find: m, replace: m.slice(0, -1) + letter.toUpperCase() });
  }

  // Clarity: wordy phrases (one-click concise replacement).
  for (const [wordy, tight] of WORDY_FIXES)
    for (const m of phraseMatches(body, wordy).slice(0, 3))
      push("Clarity", `Wordy: “${m}”`, `Shorter and stronger as “${tight}”.`,
        { find: m, replace: /^[A-Z]/.test(m) ? cap1(tight) : tight });

  // Clarity: "very + adjective" upgrades.
  for (const [phrase, strong] of Object.entries(VERY_MAP))
    for (const m of phraseMatches(body, phrase))
      push("Clarity", `Stronger word: “${m}”`, `One precise word beats two vague ones: “${strong}”.`,
        { find: m, replace: /^[A-Z]/.test(m) ? cap1(strong) : strong });
  // Clarity: leftover qualifiers dull the point.
  const quals = QUALIFIERS.flatMap((q) => phraseMatches(body, q));
  if (quals.length >= 3)
    push("Clarity", `${quals.length} qualifier words (really/just/quite/rather)`,
      "Try deleting each — if the sentence survives, it was stronger without it.");

  // Engagement: weak words with alternatives.
  for (const [weak, alts] of Object.entries(WEAK_ALTS)) {
    const n = phraseMatches(body, weak).length;
    if (n) push("Engagement", `Vague word: “${weak}” (${n}×)`, `Consider: ${alts.join(", ")}.`);
  }
  // Engagement: sentence variety — same opener 3+ times.
  const openers = {};
  for (const s of sentencesOf(body)) {
    const w = (s.match(/^[A-Za-z']+/) || [""])[0].toLowerCase();
    if (w) openers[w] = (openers[w] || 0) + 1;
  }
  for (const [w, n] of Object.entries(openers))
    if (n >= 3 && sentencesOf(body).length >= 6)
      push("Engagement", `${n} sentences start with “${w}”`, "Vary openers — flip a clause, ask a question, or merge two short sentences.");

  // Delivery: hedging, slang, shouting.
  const hedgeN = HEDGES.reduce((a, h) => a + phraseMatches(body, h).length, 0);
  if (hedgeN >= 2) push("Delivery", `${hedgeN} hedging phrases`, "Hedges (“sort of”, “I think”) make claims sound unsure. Keep them only where uncertainty is real.");
  const casualFound = [...new Set(CASUAL.flatMap((c) => phraseMatches(body, c).map((m) => m.toLowerCase())))];
  if (casualFound.length) push("Delivery", `Casual slang: ${casualFound.join(", ")}`, "Fine for a chatty blog, risky for professional pieces — swap for precise terms.");
  const excl = (body.match(/!/g) || []).length;
  if (excl >= 2) push("Delivery", `${excl} exclamation marks`, "One per article is plenty — strong words carry excitement better.");

  return issues;
}

function writingTone(body) {
  const hedgeN = HEDGES.reduce((a, h) => a + phraseMatches(body, h).length, 0);
  const qualN = QUALIFIERS.reduce((a, q) => a + phraseMatches(body, q).length, 0);
  const casualN = CASUAL.reduce((a, c) => a + phraseMatches(body, c).length, 0);
  const excl = (body.match(/!/g) || []).length;
  if (casualN >= 3) return { label: "Casual", advice: "Reads chatty. If this is a professional publication, trade slang for precise terms." };
  if (hedgeN + qualN >= 5) return { label: "Cautious", advice: "Reads unsure — cut hedges and qualifiers to sound authoritative." };
  if (excl >= 3) return { label: "Enthusiastic", advice: "High energy. Dial exclamations back so the content itself carries it." };
  return { label: "Confident & neutral", advice: "Good default for articles — direct without shouting." };
}

function gradeLevel(text) {
  const ws = words(text), ss = sentencesOf(text);
  if (!ws.length || !ss.length) return null;
  const syl = ws.reduce((a, w) => a + countSyllables(w), 0);
  return 0.39 * (ws.length / ss.length) + 11.8 * (syl / ws.length) - 15.59;
}

function applyWritingFix(i) {
  const fix = currentWritingFixes[+i];
  if (!fix) return;
  if (fix.special === "prepunct") {
    els.body.value = els.body.value.replace(/ +([,.!?;:])/g, "$1");
  } else if (fix.all) {
    const re = new RegExp(escRe(fix.find), "g");
    els.body.value = els.body.value.replace(re, fix.replace);
  } else {
    const re = new RegExp(escRe(fix.find), "i");
    els.body.value = els.body.value.replace(re, (m) => {
      if (/^[A-Z]/.test(m) && /^[a-z]/.test(fix.replace)) return cap1(fix.replace);
      return fix.replace;
    });
  }
  analyze();
}

const CAT_CLASS = { Correctness: "fail", Clarity: "warn", Engagement: "engage", Delivery: "deliver" };

function renderWriting(body) {
  const toneEl = $("tone"), listEl = $("writing");
  const bw = words(body).length;
  if (!bw) {
    toneEl.innerHTML = "";
    listEl.innerHTML = `<li><p class="hint">Writing suggestions (spelling, clarity, tone) appear here once the article body has text. Plagiarism checking isn't included on purpose — it needs a web service, and your draft never leaves this browser.</p></li>`;
    currentWritingFixes = [];
    return { grade: null };
  }
  const issues = analyzeWriting(body);
  const tone = writingTone(body);
  const grade = gradeLevel(body);
  const mins = Math.max(1, Math.round(bw / 200));
  const cats = ["Correctness", "Clarity", "Engagement", "Delivery"]
    .map((c) => `${c}: ${issues.filter((x) => x.cat === c).length}`).join(" · ");

  toneEl.innerHTML = `<div class="sug"><h4>Tone: ${esc(tone.label)} · Grade ~${grade === null ? "–" : Math.max(1, Math.round(grade))} · ${mins} min read</h4><p class="hint">${esc(tone.advice)} ${esc(cats)}</p></div>`;

  currentWritingFixes = issues.map((x) => x.fix);
  const shown = issues.slice(0, 25);
  listEl.innerHTML = shown.map((w, i) =>
    `<li><b><span class="badge ${CAT_CLASS[w.cat]}">${w.cat}</span>${esc(w.title)}</b><p>${esc(w.detail)}</p>` +
    (w.fix ? `<p><button class="btn small copy" data-w="${i}" type="button">Apply fix</button></p>` : "") + `</li>`).join("")
    + (issues.length > shown.length ? `<li><p class="hint">Showing ${shown.length} of ${issues.length} — apply these and the rest will surface.</p></li>` : "")
    + (!issues.length ? `<li><b><span class="badge pass">clean</span>Nothing flagged</b><p>No spelling, wordiness, or tone issues found. Nice.</p></li>` : "");
  listEl.querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => applyWritingFix(b.dataset.w)));
  return { grade };
}

/* ---------- Draft persistence / toolbar ---------- */
function saveDraft() {
  localStorage.setItem(LS_DRAFT, JSON.stringify({
    keyphrase: els.keyphrase.value, title: els.title.value, summary: els.summary.value,
    excerpt: els.excerpt.value, body: els.body.value,
  }));
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DRAFT) || "{}");
    for (const [k, el] of [["keyphrase", els.keyphrase], ["title", els.title], ["summary", els.summary], ["excerpt", els.excerpt], ["body", els.body]])
      if (typeof d[k] === "string") el.value = d[k];
  } catch { /* ignore */ }
}

const SAMPLE = {
  keyphrase: "budget mechanical keyboards",
  title: "Budget mechanical keyboards worth it",
  summary: "We tested cheap keyboards to see which ones are actually good and worth your money in 2026.",
  excerpt: "We tested cheap keyboards to see which ones are actually good and worth your money in 2026.",
  body: `I bought a cheap keyboard last year and it was fine for a while. Then some keys started failing. This is a review of what happened.\n\nThere are a lot of options on the market and it is very hard to know which one is the best because every single manufacturer claims that their product was built with the highest quality materials and was designed by experts, which was shown to be questionable in our testing.\n\nYou can buy one here https://example.com/keyboard and read more at https://example.org/switch-guide if you want.`,
};

function reportText() {
  if (!lastReport) return "No analysis yet.";
  const lines = [`SEO Article Review — score ${lastReport.score ?? "–"}/100 (rules v${lastReport.rulesVersion})`, ""];
  for (const c of lastReport.checks) lines.push(`[${c.status.toUpperCase()}] ${c.title} — ${c.detail}`);
  lines.push("");
  const sugs = els.suggestions._data || [];
  if (sugs.length) { lines.push("SUGGESTED EDITS"); for (const s of sugs) lines.push(`- ${s.h}: ${s.text}`); }
  return lines.join("\n");
}

/* ---------- Wire up ---------- */
let deb;
const queueAnalyze = () => { clearTimeout(deb); deb = setTimeout(analyze, 200); };
for (const el of [els.keyphrase, els.title, els.summary, els.excerpt, els.body])
  el.addEventListener("input", queueAnalyze);

$("btn-sample").addEventListener("click", () => {
  els.keyphrase.value = SAMPLE.keyphrase; els.title.value = SAMPLE.title;
  els.summary.value = SAMPLE.summary; els.excerpt.value = SAMPLE.excerpt; els.body.value = SAMPLE.body;
  analyze();
});
$("btn-clear").addEventListener("click", () => {
  for (const el of [els.keyphrase, els.title, els.summary, els.excerpt, els.body]) el.value = "";
  analyze();
});
$("btn-copy-report").addEventListener("click", (e) => {
  navigator.clipboard.writeText(reportText()).then(() => {
    const b = e.currentTarget; b.textContent = "Copied!";
    setTimeout(() => b.textContent = "Copy report", 1200);
  });
});
$("refreshRules").addEventListener("click", loadRules);
$("saveRulesUrl").addEventListener("click", () => {
  const u = els.customUrl.value.trim();
  if (u) localStorage.setItem(LS_CUSTOM_RULES, u);
  loadRules();
});
$("clearRulesUrl").addEventListener("click", () => {
  localStorage.removeItem(LS_CUSTOM_RULES); els.customUrl.value = "";
  loadRules();
});
els.customUrl.value = localStorage.getItem(LS_CUSTOM_RULES) || "";

loadDraft();
loadRules();

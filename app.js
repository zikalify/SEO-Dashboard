/* SEO Article Review — 100% client-side, GitHub Pages safe (no build step). */
"use strict";

const $ = (id) => document.getElementById(id);
const els = {
  keyphrase: $("in-keyphrase"), title: $("in-title"), summary: $("in-summary"),
  excerpt: $("in-excerpt"), body: $("in-body"),
  checks: $("checks"), suggestions: $("suggestions"), stats: $("stats"),
  scoreNum: $("scoreNum"), dial: $("dial"), verdict: $("verdict"), scoreHint: $("scoreHint"),
};
const LS_DRAFT = "seo-review-draft-v1";

/* ---------- Built-in fallback rules (used only if the local file can't load) ---------- */
const FALLBACK_RULES = {
  version: "built-in fallback",
  updated: "2026-10-04",
  sources: ["https://developers.google.com/search/docs/fundamentals/seo-starter-guide"],
  rules: {
    title: { minChars: 40, maxChars: 60, hardMaxChars: 70, rewriteSafeMin: 51, rewriteSafeMax: 55, keywordAtStartMaxPos: 15 },
    summary: { minChars: 120, maxChars: 155, hardMaxChars: 170 },
    excerpt: { minChars: 80, maxChars: 160, hardMaxChars: 200 },
    body: { minWords: 300, goodWords: 1000, minParagraphs: 3, maxSentenceWords: 25, longSentenceShareWarn: 0.25, maxParagraphWords: 120, keywordDensityMin: 0.005, keywordDensityMax: 0.025, keywordDensityGoodMax: 0.02, firstKeywordWithinWords: 100, sectionLevel: 2, minSections: 1, wordsPerSection: 350, minInternalLinks: 1, minExternalLinks: 1, transitionWordsMinShare: 0.2, passiveVoiceMaxShare: 0.15 },
    readability: { fleschGood: 60, fleschOkay: 40 },
  },
  powerWords: ["ultimate", "proven", "essential", "complete", "best", "guide", "how", "why", "new", "free", "easy", "fast", "secret", "top"],
};

let RULES = FALLBACK_RULES;

/* ---------- Rules loading (local static file + built-in fallback; silent) ---------- */
async function loadRules() {
  try {
    const res = await fetch("./seo-rules.json", { cache: "no-store" });
    if (!res.ok) throw new Error("no rules file");
    const json = await res.json();
    if (!json || !json.rules) throw new Error("bad rules file");
    RULES = json;
  } catch {
    RULES = FALLBACK_RULES; // file:// opens land here; identical thresholds
  }
  analyze();
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
    // Section level comes from live rules (Neowin CMS = H3; standard sites = H2).
    const lvl = R.body.sectionLevel || 2, tag = "H" + lvl, hashes = "#".repeat(lvl);
    const secs = heads.filter(h => h.level === lvl);
    if (secs.length < R.body.minSections) add("body-h", "warn", "No clear sections", `Add ${hashes} subheadings with keyword variants — they structure snippets and featured answers. (House style: ${tag}.)`, 2);
    else {
      const need = Math.max(R.body.minSections, Math.floor(bw / R.body.wordsPerSection));
      if (secs.length >= need) add("body-h", "pass", `${secs.length} ${tag} section${secs.length > 1 ? "s" : ""}`, "Good structure for skimmers and crawlers.", 2);
      else add("body-h", "warn", `Only ${secs.length} ${tag} section${secs.length > 1 ? "s" : ""}`, `For ~${bw} words aim for ~${need}. Each ${tag} should promise one answer.`, 2);
    }
    if (heads.some(h => h.level === 1) || /^#\s/m.test(body)) add("body-h1", "warn", "Avoid H1 inside the body", `Your title is the H1 — start body sections at ${hashes}.`, 0.5);

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

      const inHead = heads.some(h => h.level >= lvl && h.text.toLowerCase().includes(kw.toLowerCase()));
      add("body-hkw", inHead ? "pass" : "warn", inHead ? "Keyphrase in a heading" : "No heading contains keyphrase",
        inHead ? "Nice — reinforces structure." : `Work “${kw}” (or a variant) into one ${hashes} heading.`, 1);
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
  // Done marks count as manual passes (badged, reversible) — for steps the
  // parser can't verify, e.g. a link format it doesn't recognize.
  const shown = checks.map((c) => ((c.status === "warn" || c.status === "fail") && doneChecks[c.id])
    ? { ...c, status: "pass", manual: true, detail: c.detail + " (Marked done by you — not auto-verified.)" } : c);
  const scored = shown.filter(c => c.status !== "skip" && c.weight > 0);
  const pts = { pass: 1, warn: 0.45, fail: 0 };
  const got = scored.reduce((a, c) => a + (pts[c.status] ?? 0) * c.weight, 0);
  const max = scored.reduce((a, c) => a + c.weight, 0) || 1;
  const score = max === 1 && scored.length === 0 ? null : Math.round(got / max * 100);
  lastReport = { score, checks: shown, vals, rulesVersion: RULES.version, rulesUpdated: RULES.updated, at: new Date().toISOString() };

  els.scoreNum.textContent = score === null ? "–" : score;
  els.dial.style.setProperty("--p", score ?? 0);
  els.dial.style.background = `conic-gradient(${score == null ? "#2c3d52" : score >= 80 ? "var(--accent)" : score >= 55 ? "var(--warn)" : "var(--fail)"} ${(score ?? 0)}%, #0c1219 0)`;
  els.verdict.textContent = score === null ? "Start typing…" :
    score >= 80 ? "Strong — ready to publish" : score >= 55 ? "Close — fix the warnings" : "Needs work — see suggestions";
  els.scoreHint.textContent = score === null ? "Your overall SEO readiness appears here. Every check below updates as you type."
    : `${shown.filter(c => c.status === "pass").length}/${scored.length} checks passing${shown.some((c) => c.manual) ? " (incl. manual)" : ""}.`;

  els.checks.innerHTML = shown.map(c =>
    `<li><b><span class="badge ${c.manual ? "manual" : c.status}">${c.manual ? "done ✓" : c.status}</span>${esc(c.title)}</b><p>${esc(c.detail)}</p></li>`).join("")
    || `<li><p class="hint">No checks yet.</p></li>`;

  renderSuggestions(vals, (id) => shown.find((c) => c.id === id), max);
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

// Raw (markdown-intact) sentence splitter — block-aware so a heading line can
// never glue itself to the next paragraph. Each result is an exact raw
// substring, so a suggested fix maps byte-for-byte back onto the draft.
const rawSentences = (t) => {
  const out = [];
  for (const block of (t || "").split(/\n\s*\n/)) {
    for (const m of (block.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [])) {
      const s = m.trim();
      if (s && words(s).length > 1) out.push(s);
    }
  }
  return out;
};
// Mask URLs with equal-length spaces so search indices map 1:1 back onto raw text.
const maskUrls = (r) => (r || "")
  .replace(/https?:\/\/\S+/g, (m) => " ".repeat(m.length))
  .replace(/\]\([^)]*\)/g, (m) => " ".repeat(m.length));
// First words that can plausibly start a sentence (pronouns, determiners,
// capitalized nouns, gerunds) — guards bare-clause splits against fragments.
const STARTER = /^(he|she|it|they|we|you|i|this|that|these|those|there|here|my|your|his|her|its|our|their|the|a|an|[A-Z][\w'-]*|\w+ing)$/;
const startsWell = (s) => STARTER.test((s.trim().split(/\s+/)[0] || "").replace(/^[^A-Za-z]+/, ""));
// Genuinely split a long sentence in two (not truncate): returns
// {find, replace} against the raw draft, or null if no safe split point.
// Patterns, best first: comma-conjunction, semicolon, colon/dash,
// "…, where …" (drop "where"), final "…, which …" → "This …",
// final ", an X that …" → "This X …", bare "and" (starter-guarded),
// "… to check they …" → "… They can check whether they …".
function splitLongSentence(raw, maxWords) {
  if (words(raw).length <= maxWords) return null;
  if (/^\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+|```|\||<)/.test(raw)) return null; // headings/quotes/lists/code/tables/HTML
  const masked = maskUrls(raw);
  const cands = []; // {idx, pri, left, right}
  const all = (re) => { const o = []; let m; re.lastIndex = 0; while ((m = re.exec(masked)) !== null) { o.push(m); if (o.length > 12) break; } return o; };
  for (const m of all(/, (and|but|or|so|yet)\b/gi)) cands.push({ idx: m.index, pri: 0, left: raw.slice(0, m.index), right: raw.slice(m.index + m[0].length) });
  for (const m of all(/;/g)) cands.push({ idx: m.index, pri: 1, left: raw.slice(0, m.index), right: raw.slice(m.index + 1) });
  for (const m of all(/:| — | – /g)) cands.push({ idx: m.index, pri: 2, left: raw.slice(0, m.index), right: raw.slice(m.index + m[0].length) });
  for (const m of all(/, where /gi)) cands.push({ idx: m.index, pri: 3, left: raw.slice(0, m.index), right: raw.slice(m.index + ", where ".length) });
  {
    const li = masked.lastIndexOf(", ");
    if (li > 0) {
      const tailR = raw.slice(li + 2);
      let m = tailR.match(/^(an?|the) ([^,;]+?) that ([^,;]+?)\s*([.!?…])$/);
      if (m && m[2].split(/\s+/).length <= 6 && m[3].split(/\s+/).length >= 2)
        cands.push({ idx: li, pri: 3, left: raw.slice(0, li), right: `This ${m[2].trim()} ${m[3].trim()}${m[4]}` });
      else if ((m = tailR.match(/^which ([^,;]+?)\s*([.!?…])$/)) && m[1].split(/\s+/).length >= 2)
        cands.push({ idx: li, pri: 3, left: raw.slice(0, li), right: `This ${m[1].trim()}${m[2]}` });
    }
  }
  for (const m of all(/ and /g)) {
    if (masked[m.index - 2] === ",") continue; // comma-conjunction handled above
    cands.push({ idx: m.index, pri: 4, left: raw.slice(0, m.index), right: raw.slice(m.index + 5) });
  }
  for (const m of all(/ to (check|confirm|verify) they /gi))
    cands.push({ idx: m.index, pri: 5, left: raw.slice(0, m.index), right: `They can ${m[1]} whether they ` + raw.slice(m.index + m[0].length) });
  const mid = raw.length / 2;
  const viable = cands.filter((c) => {
    const right = c.right.replace(/^\s+/, "");
    return words(c.left).length >= 4 && words(right).length >= 4 && startsWell(right);
  });
  if (!viable.length) return null;
  const bestPri = Math.min(...viable.map((c) => c.pri));
  viable.sort((a, b) => Math.abs(a.idx - mid) - Math.abs(b.idx - mid));
  const best = viable.find((c) => c.pri === bestPri) || viable[0];
  let left = best.left.replace(/[\s,;:—–-]+$/, "");
  if (!/[.!?…]$/.test(left)) left += ".";
  let right = best.right.replace(/^\s+/, "").replace(/^[a-z]/, (ch) => ch.toUpperCase());
  if (!/[.!?…]$/.test(right)) right += ".";
  return { find: raw, replace: left + " " + right };
}

const finishSentence = (t) => { t = (t || "").trim().replace(/\s+/g, " "); if (t && !/[.!?…]$/.test(t)) t += "."; return t; };

// Delete only provably-safe filler: known wordy phrases, throat-clearing
// openers, comma-wrapped asides, stray qualifiers. Returns {text, note} or null.
function tightenSentence(raw) {
  let t = raw;
  const ops = [];
  for (const [w, r] of WORDY_FIXES) {
    const re = new RegExp("\\b" + escRe(w) + "\\b", "gi");
    if (re.test(t)) {
      ops.push(`“${w}” → “${r}”`);
      t = t.replace(new RegExp("\\b" + escRe(w) + "\\b", "gi"),
        (m) => (/^[A-Z]/.test(m) ? r[0].toUpperCase() + r.slice(1) : r));
    }
  }
  if (/^(it is important to note that|it goes without saying that|as we all know,|in this day and age,|needless to say,|in today's fast-paced world,)\s*/i.test(t)) {
    ops.push("cuts throat-clearing opener");
    t = t.replace(/^(it is important to note that|it goes without saying that|as we all know,|in this day and age,|needless to say,|in today's fast-paced world,)\s*/i, "")
         .replace(/^[a-z]/, (ch) => ch.toUpperCase());
  }
  const ap = t.match(/,\s*(an?|the)\s+[^,;]{4,60},\s*/);
  if (ap && words(t.replace(ap[0], " ")).length >= 8) {
    ops.push(`cuts aside (“${ap[0].trim().slice(0, 40)}…”)`);
    t = t.replace(ap[0], " ");
  }
  if (/\b(really|quite|rather)\b/i.test(t)) {
    ops.push("drops qualifiers");
    t = t.replace(/\b(really|quite|rather) (?=[a-z])/gi, "");
  }
  t = t.replace(/\s{2,}/g, " ").trim();
  if (t === raw || words(raw).length - words(t) < 1) return null;
  return { text: t, note: ops.slice(0, 2).join("; ") || "trims filler" };
}

// Last resort: cut the tail at the latest boundary that leaves a complete
// sentence under the limit. Returns {kept, tail} or null. The suggestion card
// always shows what gets dropped, so this is a deliberate cut, never silent.
function tailCut(text, maxWords) {
  const masked = maskUrls(text);
  const cuts = [];
  const all = (re) => { const o = []; let m; re.lastIndex = 0; while ((m = re.exec(masked)) !== null) { o.push(m.index); if (o.length > 15) break; } return o; };
  for (const i of all(/, and\b/gi)) cuts.push(i);
  for (const i of all(/, but\b/gi)) cuts.push(i);
  for (const i of all(/, or\b/gi)) cuts.push(i);
  for (const i of all(/;/g)) cuts.push(i);
  for (const i of all(/:/g)) cuts.push(i);
  for (const i of all(/ — | – /g)) cuts.push(i);
  for (const i of all(/,/g)) cuts.push(i);
  for (const i of all(/ that\b/gi)) cuts.push(i + 0);
  for (const i of all(/ which\b/gi)) cuts.push(i);
  for (const i of all(/ who\b/gi)) cuts.push(i);
  for (const i of all(/ because\b/gi)) cuts.push(i);
  for (const i of all(/ although\b/gi)) cuts.push(i);
  for (const i of all(/ while\b/gi)) cuts.push(i);
  for (const i of all(/ and\b/gi)) { if (masked[i - 2] !== ",") cuts.push(i); }
  for (const i of all(/ or\b/gi)) { if (masked[i - 2] !== ",") cuts.push(i); }
  for (const m of all(/ to (check|see|learn|ensure|confirm|understand)\b/gi)) cuts.push(m);
  let best = null;
  const total = words(text).length;
  for (const i of cuts) {
    let kept = text.slice(0, i).replace(/[\s,;:—–-]+$/, "").trim();
    if (/[\d,]$/.test(kept)) continue; // never cut inside a number ("46,000")
    const parts = kept.split(/\s+/);
    while (parts.length > 1 && DANGLING.has(parts[parts.length - 1].toLowerCase())) parts.pop();
    kept = parts.join(" ");
    const n = words(kept).length;
    if (n >= 10 && n <= maxWords && total - n >= 2 && (!best || n > best.n)) best = { kept: finishSentence(kept), n };
  }
  if (!best) return null;
  return { kept: best.kept, tail: best.kept.split(/\s+/).slice(-4).join(" ") };
}

// One entry point: split (meaning preserved) → tighten (safe deletions) →
// tail-cut (shown honestly) → null (truly unsplittable, advise by hand).
function shortenFix(raw, maxWords) {
  const split = splitLongSentence(raw, maxWords);
  if (split) return { kind: "split", replace: split.replace, note: "splits it in two at a clean clause break (meaning preserved)" };
  const tight = tightenSentence(raw);
  const base = tight ? tight.text : raw;
  if (tight && words(base).length <= maxWords)
    return { kind: "tighten", replace: finishSentence(base), note: `trims filler (${tight.note})` };
  const cut = tailCut(base, maxWords);
  if (cut) return { kind: "cut", replace: cut.kept, note: `${tight ? "trims filler, then " : ""}cuts everything after “…${cut.tail}” — check nothing vital is lost` };
  return null;
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

function renderSuggestions({ kw, title, summary, excerpt, body }, getCheck, totalW) {
  const out = [];
  // satisfies: the check-id this suggestion resolves — lets a Done mark count
  // that check as manually passed in scoring (badged, reversible).
  const push = (h, why, text, fix, copy, satisfies) => { if (text) out.push({ h, why, text, fix, copy: copy !== false, satisfies }); };
  const R = RULES.rules;

  if (title.trim()) {
    const fixed = suggestTitle(title, kw);
    if (fixed !== title.trim())
      push("Title rewrite", `Fits ${R.title.minChars}–${R.title.maxChars} chars${kw ? " with the keyphrase up front" : ""}.`, fixed, null, true, "title-len");
    else if (title.trim().length < R.title.minChars)
      push("Title idea", "Too short to compete — add a promise or scope.", `${title.trim()} — what you get and who it's for`.slice(0, R.title.maxChars), null, true, "title-len");
  }
  if (summary.trim() || title.trim()) {
    const base = summary.trim() || `${stripMdHtml(body).split(/\s+/).slice(0, 24).join(" ")}…`;
    let s = base;
    if (kw && !base.toLowerCase().includes(kw.toLowerCase()) && kw) s = `${kw[0].toUpperCase() + kw.slice(1)} — ${s}`;
    s = smartTrim(s, R.summary.maxChars);
    if (!/[.!?……]$/.test(s) && s.length > 40) s = s.replace(/…$/, "") + ".";
    if (s && s !== summary.trim()) push("Summary rewrite (meta description)", `~${R.summary.minChars}–${R.summary.maxChars} chars, keyphrase + benefit + reason to click.`, s, null, true, "summary-len");
  }
  if (excerpt.trim() && summary.trim() && stripMdHtml(excerpt).toLowerCase() === stripMdHtml(summary).toLowerCase())
    push("Excerpt rewrite (de-duplicate)", "Don't repeat the summary — tease instead.", smartTrim("Inside: " + excerpt.trim().replace(/^inside:\s*/i, ""), R.excerpt.maxChars), null, true, "excerpt-len");
  else if (excerpt.trim() && excerpt.trim().length > R.excerpt.maxChars)
    push("Excerpt trim", "Keep the hook inside the card cutoff.", smartTrim(excerpt.trim(), R.excerpt.maxChars), null, true, "excerpt-len");

  const bw = words(body).length;
  if (bw > 0) {
    const heads = parseHeadings(body);
    const lvl = RULES.rules.body.sectionLevel || 2, hashes = "#".repeat(lvl), tag = "H" + lvl;
    // Insertion cards follow detected opportunities (every heading-less section),
    // NOT the score quota — adding one heading never hides the others.
    const spots = headingInsertions(body, kw);
    if (spots.length) {
      spots.forEach((sp, i) => push(
        `Suggested heading ${i + 1} (${tag})`,
        `Detected a ${words(sp.para).length}-word section with no heading, starting “${sp.preview}…” — ${sp.reason}, so “${sp.title}” fits. ${sp.draft ? "Working title — rewrite it in your own words" : "Ready to use as-is; tap Insert"}.`,
        hashes + " " + sp.title,
        { find: sp.para, replace: hashes + " " + sp.title + "\n\n" + sp.para, verb: "Insert heading" },
        true, "body-h"
      ));
    } else {
      const h2count = heads.filter((h) => h.level === lvl).length;
      const h2need = Math.max(RULES.rules.body.minSections, Math.floor(bw / RULES.rules.body.wordsPerSection));
      if (h2count < h2need) {
        push("Structure fix", "Add scannable sections — each heading answers one question. (No clear paragraphs detected, so place these by hand.)",
          [hashes + " What it is", hashes + " Why it matters", hashes + " How to do it", hashes + " Mistakes to avoid", hashes + " FAQ"].join("\n"), null, true, "body-h");
      }
    }
    if (kw && !heads.some(h => h.text.toLowerCase().includes(kw.toLowerCase())))
      push("Heading idea", "Give crawlers one keyword-bearing section heading.", `${hashes} ${kw[0]?.toUpperCase() + kw.slice(1) || "Key topic"}: what to know`, null, true, "body-hkw");
    const { internal, external } = parseLinks(body);
    if (!internal.length) push("Internal link idea", "Keeps readers + authority in your cluster.", "Link a phrase to 1–2 related posts (e.g. “see our [beginner's guide](/… )”).", null, true, "body-il");
    if (!external.length) push("Citation idea", "Ground one claim with a source.", "Cite one authoritative page: [source name](https://…) near your strongest claim.", null, true, "body-el");
    const longS = rawSentences(body).filter((s) => words(s).length > R.body.maxSentenceWords).slice(0, 2);
    longS.forEach((s) => {
      const fix = shortenFix(s, R.body.maxSentenceWords);
      if (fix) push(fix.kind === "split" ? "Split into two sentences" : "Shorten sentence",
        `Over ${R.body.maxSentenceWords} words — ${fix.note}.`, fix.replace,
        { find: s, replace: fix.replace, verb: "Replace in draft" });
      else {
        const ws = s.split(/\s+/);
        const mid = ws.slice(Math.max(0, Math.floor(ws.length / 2) - 2), Math.floor(ws.length / 2) + 2).join(" ");
        push("Long sentence — split by hand", `Over ${R.body.maxSentenceWords} words with no safe automatic fix. Try breaking it near “…${mid}…”.`, s, null, false);
      }
    });
    const f = flesch(body);
    if (f !== null && f < RULES.rules.readability.fleschOkay)
      push("Readability fix", `Flesch ${Math.round(f)} is dense — prefer short sentences and plain verbs.`, "Rewrite one paragraph with 15-word sentences, active verbs, and a list.", null, false, "body-read");
  }

  // Rank by exact score impact: fixing a failed heavyweight check gains more
  // than polishing a warning. Biggest gains float to the top. (Sort is stable,
  // so equal-impact cards keep their logical order.)
  const PTS = { pass: 1, warn: 0.45, fail: 0 };
  for (const s of out) {
    const c = s.satisfies && getCheck ? getCheck(s.satisfies) : null;
    s.impact = (c && c.weight > 0 && c.status !== "skip" && totalW > 0)
      ? Math.round(c.weight * (1 - (PTS[c.status] ?? 0)) / totalW * 100) : 0;
  }
  out.sort((a, b) => b.impact - a.impact);

  els.suggestions.innerHTML = out.length ? out.map((s, i) => {
    const done = s.satisfies && doneChecks[s.satisfies];
    return `<div class="sug${done ? " is-done" : ""}"><h4>${esc(s.h)}${s.impact > 0 ? ` <span class="badge impact">+${s.impact}</span>` : ""}${done ? ' <span class="badge manual">done ✓</span>' : ""}</h4><p class="hint">${esc(s.why)}</p><blockquote>${esc(s.text)}</blockquote>` +
    (s.fix
      ? `<button class="btn small copy" data-r="${i}" type="button">${esc(s.fix.verb || "Replace in draft")}</button> <button class="btn small ghost" data-find="${i}" type="button">Find</button>`
      : (s.copy ? `<button class="btn small copy" data-i="${i}" type="button">Copy</button>` : "")) +
    (s.satisfies ? ` <button class="btn small ghost" data-done="${i}" type="button">${done ? "Undo" : "Done"}</button>` : "") + `</div>`;
  }).join("")
    : `<p class="hint">Suggestions will appear here once there is something to review.</p>`;
  els.suggestions.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => {
    navigator.clipboard.writeText(out[+b.dataset.i].text).then(() => { b.textContent = "Copied!"; setTimeout(() => b.textContent = "Copy", 1200); });
  }));
  els.suggestions.querySelectorAll("[data-done]").forEach(b => b.addEventListener("click", () => {
    const s = out[+b.dataset.done];
    if (!s || !s.satisfies) return;
    if (doneChecks[s.satisfies]) delete doneChecks[s.satisfies];
    else { pushUndo("Done: " + s.h); doneChecks[s.satisfies] = true; }
    saveDone();
    analyze();
  }));
  els.suggestions.querySelectorAll("[data-find]").forEach(b => b.addEventListener("click", () => {
    // Jump to the problem text in the draft: native selection = highlight.
    const s = out[+b.dataset.find];
    if (!s || !s.fix) return;
    const idx = els.body.value.indexOf(s.fix.find);
    if (idx === -1) { const t = b.textContent; b.textContent = "Gone"; setTimeout(() => b.textContent = t, 1200); return; }
    els.body.scrollIntoView({ block: "nearest", behavior: "smooth" });
    els.body.focus({ preventScroll: true });
    els.body.setSelectionRange(idx, idx + s.fix.find.length);
    els.body.classList.add("flash");
    setTimeout(() => els.body.classList.remove("flash"), 1000);
  }));
  els.suggestions.querySelectorAll("[data-r]").forEach(b => b.addEventListener("click", () => {
    const s = out[+b.dataset.r];
    if (!s || !s.fix) return;
    pushUndo(s.h);
    els.body.value = els.body.value.replace(s.fix.find, () => s.fix.replace);
    analyze(); // re-runs: the fixed issue disappears, which is the confirmation
  }));
  els.suggestions._data = out;
}

function renderStats({ kw, title, summary, excerpt, body }, grade) {
  const bw = words(body).length;
  const lvl = RULES.rules.body.sectionLevel || 2;
  const dens = kw && bw ? (keywordCount(body, kw) / bw * 100) : null;
  const f = flesch(body);
  const { internal, external } = parseLinks(body);
  const rows = [
    ["Focus keyphrase", kw ? esc(kw) + ` · ${keywordCount(title + " " + summary + " " + body, kw)}× total` : "<span class='hint'>not set</span>"],
    ["Words", `${bw} · ${sentencesOf(body).length} sentences · ${parseHeadings(body).filter(h => h.level === lvl).length} H${lvl}s`],
    ["Keyword repetition (body)", dens === null ? "<span class='hint'>—</span>" : `${dens.toFixed(1)}% exact-match (over ~${(RULES.rules.body.keywordDensityGoodMax * 100).toFixed(0)}% = review for stuffing; density itself is not a ranking factor)`],
    ["Readability", f === null ? "<span class='hint'>need ~30+ words</span>" : `Flesch ${Math.round(f)} (${f >= RULES.rules.readability.fleschGood ? "good" : f >= RULES.rules.readability.fleschOkay ? "okay" : "dense"})` + (grade !== null && grade !== undefined ? ` · grade ~${Math.max(1, Math.round(grade))} · ${Math.max(1, Math.round(bw / 200))} min read` : "")],
    ["Links", `${internal.length} internal · ${external.length} external`],
    ["Rules", `SEO rules v${esc(RULES.version || "?")} (thresholds updated ${esc(RULES.updated || "?")})`],
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
  const entry = currentWritingFixes[+i];
  const fix = entry && entry.fix;
  if (!fix) return;
  pushUndo(entry.label || "Writing fix");
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

  currentWritingFixes = issues.map((x) => ({ fix: x.fix, label: `${x.cat}: ${x.title}` }));
  const shown = issues.slice(0, 25);
  listEl.innerHTML = shown.map((w, i) =>
    `<li><b><span class="badge ${CAT_CLASS[w.cat]}">${w.cat}</span>${esc(w.title)}</b><p>${esc(w.detail)}</p>` +
    (w.fix ? `<p><button class="btn small copy" data-w="${i}" type="button">Apply fix</button></p>` : "") + `</li>`).join("")
    + (issues.length > shown.length ? `<li><p class="hint">Showing ${shown.length} of ${issues.length} — apply these and the rest will surface.</p></li>` : "")
    + (!issues.length ? `<li><b><span class="badge pass">clean</span>Nothing flagged</b><p>No spelling, wordiness, or tone issues found. Nice.</p></li>` : "");
  listEl.querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => applyWritingFix(b.dataset.w)));
  return { grade };
}

// Words that must never end a heading (they dangle: "...eligible will be", "...adept with").
const DANGLING = new Set(("a,an,the,and,or,but,to,of,with,for,in,on,at,by,from,as,is,are,was,were,be,been,will,would,can,could,shall,should,may,might,must,that,which,who,whom,whose,when,where,while,until,unless,though,although,because,since,able,likely,adept,capable,responsible,available,ready,willing,eager,prone,accustomed,subject,due,per,via,than,so,yet,nor,both,either,such,more,most,alongside,across,through,throughout,within,without,among,between,beyond,despite,during,except,toward,towards,upon,around,very,just,quite,rather,up,out,off,away").split(","));
const AUDIENCE_BLOCK = /^(example|instance|starters?|one (more )?thing|the (record|moment)|now|better or worse)$/i;

// Compress an opening line into a title: drop throat-clearing ("By training…",
// "For X,…"), flip "Organizations that are eligible" → "Eligible organizations",
// cut to length at a word boundary, strip dangling endings.
function compressTitle(s, maxLen) {
  let t = (s || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^by ([a-z]+ing)\b/i, "$1").replace(/^([a-z]+ing) (up|out|off|away)\b/i, "$1");
  t = t.replace(/\b([A-Za-z]+)s (that|who) are ([a-z]+)\b/, (mm, n, r, adj) => adj + " " + n + "s");
  if (t.length > maxLen) { const cut = t.slice(0, maxLen - 1); const sp = cut.lastIndexOf(" "); t = sp > 10 ? cut.slice(0, sp) : cut; }
  t = t.replace(/[:;,.\-–—]+$/, "").trim();
  const parts = t.split(" ");
  while (parts.length > 1 && DANGLING.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  t = parts.join(" ");
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

// Craft a genuinely relevant heading from a paragraph's content (first match wins):
// named programs → "What is X?", "For <audience>, …" → "What this means for Y",
// eligibility/apply → "Eligibility and how to apply", processes → "How it works",
// comparisons, pricing, central entities — then compressed opening line as fallback.
function craftHeading(block) {
  const plain = stripMdHtml(block).replace(/\s+/g, " ").trim();
  let m;
  if ((m = plain.match(/called (?:the )?((?:[A-Z][\w&'-]* ?)+)/))) {
    const x = m[1].trim();
    if (x.split(" ").length <= 6) return { title: `What is the ${x}?`, reason: `it names “${x}”` };
  }
  if ((m = plain.match(/^for ([^,]{3,50}),/i))) {
    const aud = m[1].trim();
    if (!AUDIENCE_BLOCK.test(aud) && !/for example/i.test(aud))
      return { title: `What this means for ${aud[0].toLowerCase() + aud.slice(1)}`, reason: `it speaks directly to ${aud}` };
  }
  const elig = /eligib\w*/i.test(plain);
  const applyW = /apply|sign ?up|register/i.test(plain);
  const contactW = /contact|email|call us|get in touch/i.test(plain);
  if (elig && (applyW || contactW)) return { title: "Eligibility and how to apply", reason: "it covers who qualifies and what to do next" };
  if (elig) return { title: "Who is eligible", reason: "it covers who qualifies" };
  if (applyW) return { title: "How to apply", reason: "it explains how to apply" };
  if (contactW) return { title: "How to get in touch", reason: "it gives a contact route" };
  if (/how it works|step[- ]by[- ]step/i.test(plain)) return { title: "How it works", reason: "it walks through the process" };
  if ((m = plain.match(/([A-Za-z][\w-]*(?: [A-Za-z][\w-]*){0,2})\s+vs\.?\s+([A-Za-z][\w-]*(?: [A-Za-z][\w-]*){0,2})/))) {
    const a = m[1].trim(), b = m[2].trim();
    if (!/^(and|or|the)$/i.test(b)) {
      const ac = a[0].toUpperCase() + a.slice(1);
      return { title: `${ac} vs ${b}`, reason: "it compares two things" };
    }
  }
  if (/\$\s?\d|\bpricing?\b|\bcosts?\b|\bsubscription\b/i.test(plain)) return { title: "Pricing and availability", reason: "it mentions price or access" };
  // Named entities — but scored, not just longest: an entity counts as the topic
  // only if it repeats, or opens the paragraph outside of a list ("Firms like
  // Bain, Capgemini, …" are examples, never the topic). Single mentions buried
  // in lists are rejected and generation falls through to better rules.
  const sents = plain.split(/(?<=[.!?…])\s+/);
  const seqCount = (s) => (s.match(/([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)+)/g) || []).length;
  const seen = new Map();
  for (const m of plain.matchAll(/([A-Z][\w'-]*(?:(?:\s+(?:of|&|and)\s+|\s+)[A-Z][\w'-]*)+)/g)) {
    const key = m[1].trim().replace(/^(the|a|an) /i, "");
    if (!key || key.split(" ").length > 5) continue;
    const at = plain.indexOf(m[0]);
    const sent = sents.find((s) => s.includes(m[0])) || "";
    const e = seen.get(key) || { count: 0, inFirst: false, listSentence: true, at };
    e.count += 1;
    if (sents[0] && sents[0].includes(m[0])) e.inFirst = true;
    if (seqCount(sent) < 3) e.listSentence = false;
    seen.set(key, e);
  }
  const rankEntity = (e, text) => e.count * 10 + (e.inFirst ? 5 : 0) + text.length / 20;
  // Confident pass: repeated entities are genuinely topical.
  let bestEnt = null, bestScore = 0;
  for (const [text, e] of seen) {
    if (e.count < 2) continue;
    const score = rankEntity(e, text);
    if (score > bestScore) { bestScore = score; bestEnt = { text, count: e.count }; }
  }
  if (bestEnt) return { title: `The ${bestEnt.text}`, reason: `“${bestEnt.text}” runs through the paragraph` };
  // Concrete figures ("10,000 software engineers") beat bland fallbacks —
  // with trailing complement-hungry adjectives stripped ("adept" needs an "at").
  const AUX = /^(have|has|had|will|would|can|could|shall|should|may|might|must|are|is|was|were|be|been|do|does|did|more|less|than|over|under|per|vs|and|or|of|to|in|on|by|for|with|from|at|as|a|the|an|that|which|who)$/i;
  for (const m of plain.matchAll(/(\d[\d,]*(?:\.\d+)?)\s+([a-zA-Z]+(?: [a-zA-Z]+){0,2})/g)) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    const parts = m[2].replace(/[,;:.]+$/, "").split(" ").filter(Boolean);
    while (parts.length > 1 && (AUX.test(parts[parts.length - 1]) || DANGLING.has(parts[parts.length - 1].toLowerCase()))) parts.pop();
    if (num >= 100 && parts.length >= 1 && !AUX.test(parts[0]))
      return { title: `${m[1]} ${parts.join(" ")}`, reason: "it leads with a concrete figure" };
  }
  // Last-chance pass: a single mention that OPENS the paragraph outside a list.
  // Deliberately ranked below concrete figures — participants aren't topics.
  bestEnt = null; bestScore = 0;
  for (const [text, e] of seen) {
    if (e.count !== 1 || !e.inFirst || e.listSentence) continue;
    const score = rankEntity(e, text);
    if (score > bestScore) { bestScore = score; bestEnt = { text, count: 1 }; }
  }
  if (bestEnt) return { title: `The ${bestEnt.text}`, reason: `it opens on ${bestEnt.text}` };
  const first = plain.split(/(?<=[.!?…])\s+/)[0] || plain;
  const t = compressTitle(first, 52);
  if (t.split(" ").length >= 3) return { title: t, reason: "distilled from the opening line", draft: true };
  return null;
}

// Find paragraphs that deserve a section heading: returns
// [{para, title, preview, reason}]. Placement is detected; titles are crafted
// from the paragraph's own content (see craftHeading) — still meant to be
// reviewed, but relevant rather than sentence fragments.
// Generic placeholders, used only when no content-based header can be derived —
// the PLACEMENT is still detected, the words are yours to replace.
const STATIC_HEADINGS = ["What you need to know", "Why it matters", "How it works", "What to watch next"];

function headingInsertions(body, kw) {
  const out = [];
  const re = /[^\n]+(?:\n(?!\n)[^\n]+)*/g; // blocks separated by blank lines
  let m, first = true;
  while ((m = re.exec(body)) !== null) {
    const block = m[0];
    if (first) { first = false; continue; } // intro needs no heading
    const trimmed = block.trim();
    if (!trimmed || /^#{1,6}\s/.test(trimmed)) continue;
    if (words(block).length < 25) continue;
    const before = body.slice(0, m.index).trimEnd().split("\n").pop() || "";
    if (/^#{1,6}\s/.test(before)) continue; // already has a heading
    const crafted = craftHeading(block);
    const plain = stripMdHtml(block).replace(/\s+/g, " ").trim();
    if (crafted) out.push({ para: block, title: crafted.title, reason: crafted.reason, preview: plain.slice(0, 60), draft: !!crafted.draft });
    else out.push({ para: block, title: STATIC_HEADINGS[out.length % STATIC_HEADINGS.length], reason: "no specific header could be derived from this paragraph, so this is a placeholder at the right spot", preview: plain.slice(0, 60), placeholder: true, draft: true });
    if (out.length >= 4) break;
  }
  return out;
}

/* ---------- Undo (one-click reversal for every programmatic edit) ----------
   Typing is covered by the browser's native Ctrl/Cmd+Z per field; this stack
   covers the destructive actions: Replace/Insert fixes, Apply-fix buttons,
   Clear, and Load sample. */
const undoStack = [];
const draftSnap = () => ({ keyphrase: els.keyphrase.value, title: els.title.value, summary: els.summary.value, excerpt: els.excerpt.value, body: els.body.value });
function pushUndo(label) {
  undoStack.push({ label, snap: draftSnap() });
  if (undoStack.length > 30) undoStack.shift();
  renderUndo();
}
function renderUndo() {
  const b = $("btn-undo");
  if (!b) return;
  b.disabled = !undoStack.length;
  b.textContent = undoStack.length ? `Undo (${undoStack.length})` : "Undo";
  b.title = undoStack.length ? `Undo: ${undoStack[undoStack.length - 1].label}` : "Nothing to undo";
}
function undoLast() {
  const u = undoStack.pop();
  if (!u) return;
  els.keyphrase.value = u.snap.keyphrase; els.title.value = u.snap.title;
  els.summary.value = u.snap.summary; els.excerpt.value = u.snap.excerpt;
  els.body.value = u.snap.body;
  renderUndo();
  analyze();
}

/* ---------- Done marks (manual passes for checks the parser can't verify) ---------- */
const LS_DONE = "seo-review-done-v1";
let doneChecks = {};
try { doneChecks = JSON.parse(localStorage.getItem(LS_DONE) || "{}"); } catch { doneChecks = {}; }
function saveDone() { localStorage.setItem(LS_DONE, JSON.stringify(doneChecks)); }
function resetDone() { doneChecks = {}; saveDone(); }

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
  pushUndo("Load sample");
  resetDone(); // dones belong to the previous draft, not the sample
  els.keyphrase.value = SAMPLE.keyphrase; els.title.value = SAMPLE.title;
  els.summary.value = SAMPLE.summary; els.excerpt.value = SAMPLE.excerpt; els.body.value = SAMPLE.body;
  analyze();
});
$("btn-clear").addEventListener("click", () => {
  if ([els.keyphrase, els.title, els.summary, els.excerpt, els.body].some((el) => el.value)) pushUndo("Clear draft");
  resetDone(); // fresh draft, fresh checklist
  for (const el of [els.keyphrase, els.title, els.summary, els.excerpt, els.body]) el.value = "";
  analyze();
});
$("btn-copy-report").addEventListener("click", (e) => {
  navigator.clipboard.writeText(reportText()).then(() => {
    const b = e.currentTarget; b.textContent = "Copied!";
    setTimeout(() => b.textContent = "Copy report", 1200);
  });
});

$("btn-undo").addEventListener("click", undoLast);

loadDraft();
loadRules();
renderUndo();

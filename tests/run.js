/* Dependency-free test harness for the SEO Review app.
 *
 * app.js is a browser script with no module system and no build step, so the
 * only way to test it is to run it for real: a minimal DOM stub, then app.js
 * evaluated in a vm context with a few internals exported through a shim that
 * is appended to the source at load time (app.js itself is never modified).
 *
 *   node tests/run.js            run everything
 *   node tests/run.js -v         print each assertion
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const VERBOSE = process.argv.includes("-v");

/* ---------------------------------------------------------------- tiny runner */
const results = [];
let current = null;

function suite(name, fn) {
  current = { name, tests: [] };
  fn();
  results.push(current);
  current = null;
}
function test(name, fn) {
  const fail = (msg) => { throw new Error(msg); };
  try {
    fn(fail);
    current.tests.push({ name, ok: true });
  } catch (err) {
    current.tests.push({ name, ok: false, err: err.message });
  }
}
const clip = (v) => {
  const j = JSON.stringify(v);
  return j && j.length > 300 ? j.slice(0, 300) + `… (${j.length} chars)` : j;
};
const eq = (actual, expected, what) => {
  const a = clip(actual), e = clip(expected);
  if (a !== e) throw new Error(`${what || "value"}: expected ${e}, got ${a}`);
};
const ok = (cond, msg) => { if (!cond) throw new Error(msg || "expected truthy"); };

/* --------------------------------------------------------------- DOM stub */
function makeElement(id) {
  const listeners = {};
  const el = {
    id,
    value: "",
    innerHTML: "",
    textContent: "",
    disabled: false,
    title: "",
    dataset: {},
    style: { setProperty() {}, width: "", background: "" },
    classList: { add() {}, remove() {}, contains() { return false; } },
    listeners,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelectorAll() { return []; },
    focus() {},
    setSelectionRange() {},
    scrollIntoView() {},
    appendChild() {},
    // Fire a handler the way a click would.
    click() { for (const fn of listeners.click || []) fn({ currentTarget: el, target: el }); },
  };
  return el;
}

function boot() {
  const nodes = new Map();
  const store = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, makeElement(id));
    return nodes.get(id);
  };
  const document = {
    getElementById: get,
    createElement: (tag) => makeElement(tag),
    addEventListener() {},
    body: { prepend() {}, appendChild() {} },
  };
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const win = { TYPO_EXTRA: {}, addEventListener() {}, __seoReady: false };
  const navigator = { clipboard: { writeText: () => Promise.resolve() } };

  const rulesPath = path.join(ROOT, "seo-rules.json");
  const sandbox = {
    document, localStorage, navigator,
    window: win,
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
    Promise, Map, Set, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent,
    // Serve seo-rules.json exactly as a static host would.
    fetch: async (url) => {
      const p = path.join(ROOT, String(url).replace(/^\.\//, ""));
      if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, "utf8")) };
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // typos.js first, exactly as index.html loads it.
  vm.runInContext(fs.readFileSync(path.join(ROOT, "typos.js"), "utf8"), sandbox, { filename: "typos.js" });

  // app.js plus a shim. Top-level const/let stay inside the vm context, so the
  // only way to reach analyze() and friends from here is to hand them out.
  const shim = `
;globalThis.__seoTest = {
  get RULES() { return RULES; },
  get FALLBACK() { return FALLBACK_RULES; },
  get report() { return lastReport; },
  get suggestions() { return els.suggestions._data || []; },
  get __ready() { return window.__seoReady; },
  els, SAMPLE, analyze, reportText, saveDraft, loadDraft, pushUndo, undoLast,
  button: (id) => els[id] || (document.getElementById(id) || null),
  words, stripMdHtml, sentencesOf, flesch, parseHeadings, parseLinks,
  countListLines, hasConclusion, imageAltIssues, unhelpfulAnchors, excerptSharesWith,
  headingInsertions, craftHeading, questionFromBody,
  keywordCount, hasKeyword, kwPattern, smartTrim, isPassive,
};`;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "app.js"), "utf8") + shim, sandbox, { filename: "app.js" });

  return sandbox.__seoTest;
}

/* loadRules() is async, so RULES is still the fallback until its fetch lands. */
async function bootReady() {
  const api = boot();
  for (let i = 0; i < 50 && api.RULES.version === "built-in fallback"; i++) {
    await new Promise((r) => setImmediate(r));
  }
  return api;
}

/* Run a fixture through analyze() and hand back the report + cards. */
function analyse(t, draft) {
  t.els.keyphrase.value = draft.keyphrase || "";
  t.els.title.value = draft.title || "";
  t.els.summary.value = draft.summary || "";
  t.els.excerpt.value = draft.excerpt || "";
  t.els.body.value = draft.body || "";
  t.analyze();
  return {
    checks: t.report.checks,
    score: t.report.score,
    cards: t.suggestions,
  };
}
const check = (r, id) => r.checks.find((c) => c.id === id);
const warned = (r, id) => {
  const c = check(r, id);
  return !!c && (c.status === "warn" || c.status === "fail");
};
const cardHeads = (r) => r.cards.map((c) => c.h);

/* --------------------------------------------------------------- fixtures */
const WORDS = (n, seed) => Array.from({ length: n }, (_, i) =>
  seed[(i * 7 + Math.floor(i / seed.length) * 3) % seed.length]).join(" ");

const VOCAB = ("the quick fix for a slow keyboard arrived on tuesday and everyone agreed that "
  + "it was better than the last one which had been replaced in march by a cheaper model that "
  + "nobody actually wanted to use because the spacebar was stiff and the plastic felt thin in "
  + "the middle where your palms rest during a long evening of writing about keyboards").split(/\s+/);

/** A draft of roughly `n` words split into `blocks` paragraphs, plus headings. */
function draftOf(n, { blocks = 6, headings = 0, prefix = "", suffix = "", links = [], images = [] } = {}) {
  const per = Math.floor(n / blocks);
  const out = [];
  for (let i = 0; i < blocks; i++) {
    if (i > 0 && i <= headings) out.push(`### Section ${i} of the piece`);
    let text = WORDS(per, VOCAB);
    if (i === 0 && prefix) text = prefix + " " + text;
    if (links[i]) text += " " + links[i];
    if (images[i]) text += "\n\n" + images[i];
    out.push(text);
  }
  if (suffix) out.push(suffix);
  return out.join("\n\n");
}

/* A realistic news brief: short, complete, and with nothing that warrants a
   subheading. This is the fixture the whole clutter complaint is about. */
const SHORT_BRIEF = {
  keyphrase: "nvidia laptop gpu",
  title: "Nvidia ships the RTX 5080 laptop GPU to partners",
  summary: "Nvidia has started shipping the RTX 5080 laptop GPU to its partners, and the first reviews are already live.",
  excerpt: "The RTX 5080 laptop GPU is shipping to partners this quarter, with reviews out now.",
  body: [
    "Nvidia has started shipping the RTX 5080 laptop GPU to its partners, and the first reviews are already live.",
    "The chip sits above the 5070 in the stack. Laptop makers will pair it with the new Intel Core Ultra 9 chips, and the first machines are due in March.",
    "Nvidia says the 5080 runs the same ray tracing workload 22 percent faster than the 5070, at 115 watts. That figure is the number to watch, because it is the one that decides how long the battery lasts.",
    "Pricing has not been confirmed. Nvidia usually announces it a fortnight before the first shipments land, so expect a number in late February.",
  ].join("\n\n"),
};

const LONG_UNSTRUCTURED = {
  keyphrase: "budget mechanical keyboards",
  title: "We tested the budget mechanical keyboards worth buying in 2026",
  summary: "We spent eight months with four budget mechanical keyboards under 60 dollars and found the one that survives contact with a daily driver, with the switch and case details that actually matter.",
  excerpt: "Four boards, eight months, one clear winner — and the eight dollar foam trick that beats every other spec on the sheet.",
  body: draftOf(900, { blocks: 5, prefix: "Budget mechanical keyboards are now a real category with real contenders." }),
};

const LONG_STRUCTURED = {
  ...LONG_UNSTRUCTURED,
  body: draftOf(900, { blocks: 5, headings: 3, prefix: LONG_UNSTRUCTURED.body.split("\n\n")[0] }),
};

async function main() {
  /* ================================================================== tests */
  const t = await bootReady();
  const RULES = t.RULES.rules;
  const MIN_STRUCTURE = RULES.body.minWordsForStructure;

  /* ---- the rules file must stay self-consistent ---- */
  suite("rules file", () => {
    test("FALLBACK_RULES matches seo-rules.json exactly (drift guard)", () => {
      const json = JSON.parse(fs.readFileSync(path.join(ROOT, "seo-rules.json"), "utf8"));
      eq(t.FALLBACK.rules, json.rules, "fallback rules");
      eq(t.FALLBACK.powerWords, json.powerWords, "fallback powerWords");
      eq(t.FALLBACK.weakHookWords, json.weakHookWords, "fallback weakHookWords");
    });

    test("the generator agrees with the committed block", () => {
      // Guards the block's SHAPE, not just its values. A generated block whose
      // closing "};" shares a line with the next statement used to send the
      // sync script's end-marker hunting past the block, and it deleted 100
      // lines of app.js. Running the generator is the only way to notice.
      const r = spawnSync(process.execPath, [path.join(__dirname, "sync-fallback.js"), "--check"], { encoding: "utf8" });
      eq(r.status, 0, `sync-fallback --check failed: ${(r.stderr || "").trim()}`);
    });

    test("the fallback block ends on its own line", () => {
      const src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
      const decl = src.indexOf("const FALLBACK_RULES = {");
      ok(decl > 0, "no FALLBACK_RULES declaration");
      const tail = src.slice(decl);
      ok(/^\};\r?\n/m.test(tail), 'FALLBACK_RULES must close with "};" on its own line');
    });

    test("app loaded the real rules file, not the fallback", () => {
      ok(t.RULES.version !== "built-in fallback", "expected seo-rules.json to have loaded");
    });

    test("weak hook words actually overlap the power words", () => {
      const weak = new Set(RULES ? t.RULES.weakHookWords : []);
      const overlap = t.RULES.powerWords.filter((w) => weak.has(w));
      ok(overlap.length >= 10, `expected the weak list to bite, only ${overlap.length} overlap`);
      for (const w of ["how", "what", "top", "best", "new", "free"]) {
        ok(weak.has(w), `${w} should be excluded as a hook`);
      }
    });

    test("structural gate is below the word-count floor that flags thin drafts", () => {
      ok(RULES.body.minWordsForStructure >= 200, "structure gate should not fire on one-line drafts");
      ok(RULES.body.minWordsForStructure <= RULES.body.minWords, "structure gate should not exceed minWords");
    });

    test("format-suggestion thresholds are ordered by how optional they are", () => {
      const { minWordsForList, minWordsForFaq, minWordsForConclusion } = RULES.body;
      ok(minWordsForList < minWordsForConclusion, "a list is cheaper to add than a conclusion");
      ok(minWordsForConclusion < minWordsForFaq, "a conclusion is cheaper to write than an FAQ");
    });
  });

  /* ---- the headline complaint: no structural nagging on short content ---- */
  suite("short content stays quiet", () => {
    test("no structural warnings on a ~170-word brief", () => {
      const r = analyse(t, SHORT_BRIEF);
      for (const id of ["body-h", "body-il", "body-el", "body-hkw", "body-list", "body-faq", "body-concl"]) {
        ok(!warned(r, id), `${id} warned on a ${t.words(SHORT_BRIEF.body).length}-word brief`);
      }
    });

    test("structure checks skip (weight 0) rather than pass, on a brief", () => {
      const r = analyse(t, SHORT_BRIEF);
      for (const id of ["body-h", "body-il", "body-el", "body-hkw"]) {
        const c = check(r, id);
        ok(c, `${id} check is missing entirely`);
        eq(c.status, "skip", `${id} status`);
        eq(c.weight, 0, `${id} weight`);
      }
    });

    test("no structural suggestion cards on a brief", () => {
      const r = analyse(t, SHORT_BRIEF);
      const banned = /heading|structure|internal link|citation|add a list|add an faq|add a conclusion/i;
      const hits = cardHeads(r).filter((h) => banned.test(h));
      eq(hits, [], "structural cards on a brief");
    });

    test("the brief still gets scored on things that do apply", () => {
      const r = analyse(t, SHORT_BRIEF);
      ok(r.checks.some((c) => c.status === "pass"), "a brief should still earn passes");
      ok(r.score > 0, "score should be computed");
    });

    test("the skip message explains itself rather than looking broken", () => {
      const r = analyse(t, SHORT_BRIEF);
      const c = check(r, "body-h");
      ok(/not needed/i.test(c.title), `unexpected skip title: ${c.title}`);
      ok(/Past ~?\d+ words this check switches on/.test(c.detail), `skip detail should say when it activates: ${c.detail}`);
    });

    test("paragraph requirement scales with length (1 for a blurb, 3 for an article)", () => {
      const tiny = analyse(t, { body: "One short paragraph of a handful of words here." });
      eq(check(tiny, "body-para"), undefined, "a 10-word draft needs no paragraph advice");

      const split = analyse(t, { body: draftOf(150, { blocks: 2 }) });
      ok(!warned(split, "body-para"), "150 words in two blocks must not be held to the 3-paragraph rule");

      const wall = analyse(t, { body: draftOf(150, { blocks: 1 }) });
      ok(warned(wall, "body-para"), "a single 150-word block is still a wall of text and should warn");
    });
  });

  /* ---- long content still gets full structural guidance ---- */
  suite("long content still gets structure help", () => {
    test("an unstructured 900-word draft fails the heading check", () => {
      const r = analyse(t, LONG_UNSTRUCTURED);
      ok(warned(r, "body-h"), "expected a heading warning");
    });

    test("heading cards are capped at the actual shortfall", () => {
      const r = analyse(t, LONG_UNSTRUCTURED);
      const bw = t.words(LONG_UNSTRUCTURED.body).length;
      const need = Math.max(RULES.body.minSections, Math.floor(bw / RULES.body.wordsPerSection));
      const cards = r.cards.filter((c) => /^Suggested heading/.test(c.h) || c.h === "Structure fix");
      ok(need >= 1 && need <= 4, `fixture should need 1-4 headings, needs ${need}`);
      eq(cards.length, need, "heading card count");
    });

    test("a draft that already has enough headings gets NO heading cards", () => {
      const r = analyse(t, LONG_STRUCTURED);
      eq(check(r, "body-h").status, "pass", "heading check");
      const cards = r.cards.filter((c) => /suggested heading|structure fix/i.test(c.h));
      eq(cards, [], "heading insertion cards for an already-structured draft");
    });

    test("the structure-fix template emits the shortfall, not five headings", () => {
      const bw = t.words(LONG_UNSTRUCTURED.body).length;
      const need = Math.max(RULES.body.minSections, Math.floor(bw / RULES.body.wordsPerSection));
      const flat = draftOf(bw, { blocks: 1 });
      const r = analyse(t, { ...LONG_UNSTRUCTURED, body: flat });
      const card = r.cards.find((c) => c.h === "Structure fix");
      ok(card, "expected a structure-fix card for a single-block draft");
      const lines = card.text.split("\n");
      ok(lines.length <= need, `template emitted ${lines.length} headings for a shortfall of ${need}`);
    });

    test("headingInsertions respects its limit argument", () => {
      const body = draftOf(2000, { blocks: 10 });
      eq(t.headingInsertions(body, "x", 1).length, 1, "limit 1");
      eq(t.headingInsertions(body, "x", 2).length, 2, "limit 2");
      ok(t.headingInsertions(body, "x", 99).length <= 4, "hard cap of 4 still applies");
    });

    test("format suggestions appear only past their own thresholds", () => {
      const under = analyse(t, { body: draftOf(RULES.body.minWordsForList - 60, { blocks: 5 }) });
      eq(check(under, "body-list"), undefined, "list card below minWordsForList");

      const over = analyse(t, { body: draftOf(RULES.body.minWordsForList + 80, { blocks: 5 }) });
      ok(warned(over, "body-list"), "list check above minWordsForList");

      const faqUnder = analyse(t, { body: draftOf(RULES.body.minWordsForFaq - 100, { blocks: 6 }) });
      eq(check(faqUnder, "body-faq"), undefined, "FAQ card below minWordsForFaq");

      const faqOver = analyse(t, { body: draftOf(RULES.body.minWordsForFaq + 100, { blocks: 6 }) });
      ok(warned(faqOver, "body-faq"), "FAQ check above minWordsForFaq");

      const conclUnder = analyse(t, { body: draftOf(RULES.body.minWordsForConclusion - 100, { blocks: 5 }) });
      eq(check(conclUnder, "body-concl"), undefined, "conclusion card below minWordsForConclusion");

      const conclOver = analyse(t, { body: draftOf(RULES.body.minWordsForConclusion + 100, { blocks: 5 }) });
      ok(warned(conclOver, "body-concl"), "conclusion check above minWordsForConclusion");
    });

    test("a draft with enough sections passes the heading check", () => {
      const bw = 900;
      const body = draftOf(bw, { blocks: 3, headings: 3 });
      const r = analyse(t, { body });
      eq(check(r, "body-h").status, "pass", "heading check on a well-divided draft");
    });
  });

  /* ---- triggers that used to contradict Google's own guidance ---- */
  suite("non-factors are never scored as failures", () => {
    test("word count never fails, at any length", () => {
      for (const n of [5, 40, 150, 299, 300, 600, 3000]) {
        const r = analyse(t, { body: draftOf(n, { blocks: 4 }) });
        const c = check(r, "body-len");
        ok(c, `no body-len check at ${n} words`);
        ok(c.status !== "fail", `body-len failed at ${n} words`);
      }
    });

    test("a low keyphrase density never warns and never fails", () => {
      const body = draftOf(1200, { blocks: 6, prefix: "Budget mechanical keyboards came up once and then not again." });
      const r = analyse(t, { keyphrase: "budget mechanical keyboards", body });
      const c = check(r, "body-kw");
      eq(c.status, "pass", "one mention in 1200 words must not be flagged");
      ok(!/rare/i.test(c.title + c.detail), "no 'too rare' advice may survive");
    });

    test("a stuffed keyphrase warns but never fails on density", () => {
      const block = "budget mechanical keyboards budget mechanical keyboards budget mechanical keyboards budget mechanical keyboards.";
      const body = Array.from({ length: 8 }, () => block).join("\n\n");
      const r = analyse(t, { keyphrase: "budget mechanical keyboards", body });
      const c = check(r, "body-kw");
      eq(c.status, "warn", "heavy repetition should warn");
    });

    test("a keyphrase that never appears is still flagged", () => {
      const r = analyse(t, { keyphrase: "quantum entanglement", body: draftOf(600, { blocks: 4 }) });
      eq(check(r, "body-kw").status, "fail", "missing focus keyphrase");
    });

    test("a missing keyphrase in the title warns rather than fails", () => {
      const r = analyse(t, { ...SHORT_BRIEF, title: "The new RTX 5080 laptop chip is here" });
      const c = check(r, "title-kw");
      ok(c, "title-kw should be emitted when a keyphrase is set");
      eq(c.status, "warn", "title-kw severity");
    });

    test("dense prose warns but never fails readability", () => {
      const hard = ("Notwithstanding the aforementioned considerations regarding implementation "
        + "complexity, the utilisation of aforementioned methodologies demonstrates considerable "
        + "effectiveness notwithstanding circumstances which might otherwise be characterised as "
        + "limiting in their potential to facilitate optimisation of organisational effectiveness. ")
        .repeat(6);
      const r = analyse(t, { body: hard });
      const c = check(r, "body-read");
      ok(c.status !== "fail", `body-read failed at Flesch ${c.detail}`);
      ok(c.status === "warn", "very dense prose should warn");
    });

    test("readability cards only appear on genuinely poor prose", () => {
      const okish = Array.from({ length: 12 }, (_, i) =>
        `The ${["team", "board", "case", "switch", "draft", "price"][i % 6]} is here. It works. We tried it for a week.`).join("\n\n");
      const r = analyse(t, { body: okish });
      eq(r.cards.filter((c) => /^Readability fix/.test(c.h)), [], "no readability card for mid-40s prose");
    });
  });

  /* ---- the title hook must stop manufacturing false passes ---- */
  suite("title hooks", () => {
    const hook = (title) => check(analyse(t, { title, body: draftOf(60, { blocks: 2 }) }), "title-hook");

    test("a number counts as a hook", () => {
      eq(hook("7 Proven Budget Mechanical Keyboards Worth Buying").status, "pass", "numeric title");
    });

    test("a strong power word counts as a hook", () => {
      eq(hook("The Proven Guide to Cheap Keyboards Everyone Recommends").status, "pass", "power-word title");
    });

    test("weak power words no longer pass the hook check", () => {
      for (const title of ["How To Choose A New Keyboard", "What Is A Mechanical Keyboard Exactly",
        "The Top New Keyboards Of The Year", "The Best Keyboard You Can Buy Right Now"]) {
        const c = hook(title);
        ok(c.status !== "pass", `"${title}" should not pass the hook check`);
      }
    });

    test("the hook check carries a small weight (CTR is not a ranking factor)", () => {
      ok(check(analyse(t, { title: "A perfectly ordinary title here", body: draftOf(60, { blocks: 2 }) }), "title-hook").weight <= 0.5,
        "title-hook weight");
    });
  });

  /* ---- summary: a reason to click, without demanding a CTA verb ---- */
  suite("summary reason to click", () => {
    const cta = (summary) => check(analyse(t, { summary, body: draftOf(60, { blocks: 2 }) }), "summary-cta");

    test("a figure passes even with no CTA verb", () => {
      eq(cta("We logged 74 decibels across four budget mechanical keyboards and found the difference.").status, "pass", "figure");
    });

    test("an explicit benefit passes even with no CTA verb", () => {
      eq(cta("Budget mechanical keyboards save most readers two hundred dollars over three years.").status, "pass", "benefit");
    });

    test("an open question passes", () => {
      eq(cta("Are budget mechanical keyboards worth it in 2026? We looked at four of them closely.").status, "pass", "question");
    });

    test("generic framing still warns", () => {
      eq(cta("Here is what to know about this topic and some information about it in general.").status, "warn", "generic");
    });

    test("no CTA card is offered when the summary already has a reason to click", () => {
      const r = analyse(t, {
        summary: "We logged 74 decibels across four budget mechanical keyboards and found the difference.",
        body: draftOf(60, { blocks: 2 }),
      });
      eq(r.cards.filter((c) => /reason to click/i.test(c.h)), [], "unnecessary CTA card");
    });
  });

  /* ---- image alt text: the gap that was not checked at all ---- */
  suite("image alt text", () => {
    test("a draft with no images gets no alt check at all", () => {
      const r = analyse(t, { body: draftOf(600, { blocks: 5 }) });
      eq(check(r, "body-alt"), undefined, "alt check with no images");
    });

    test("html and markdown images are both counted", () => {
      const r = t.imageAltIssues('![a board](a.jpg)\n\n<img src="b.jpg">\n\n<img src="c.jpg" alt="A board on a desk">');
      eq(r.total, 3, "total images");
      eq(r.missing, 1, "missing alt");
      eq(r.thin, 1, "thin alt");
    });

    test("missing alt text warns, descriptive alt text passes", () => {
      const bad = analyse(t, { body: draftOf(600, { blocks: 5, images: { 2: '<img src="x.jpg">' } }) });
      eq(check(bad, "body-alt").status, "warn", "missing alt");

      const good = analyse(t, { body: draftOf(600, { blocks: 5, images: { 2: '<img src="x.jpg" alt="Four budget mechanical keyboards lined up on a desk">' } }) });
      eq(check(good, "body-alt").status, "pass", "descriptive alt");
    });

    test("a one-word alt counts as thin, not as described", () => {
      const r = analyse(t, { body: draftOf(600, { blocks: 5, images: { 2: '<img src="x.jpg" alt="keyboard">' } }) });
      eq(check(r, "body-alt").status, "warn", "thin alt");
      ok(/thin/i.test(check(r, "body-alt").title), "thin alt title");
    });

    test("an alt card is offered when alt text is missing", () => {
      const r = analyse(t, { body: draftOf(600, { blocks: 5, images: { 2: "![ ](x.jpg)" } }) });
      ok(r.cards.some((c) => /alt text/i.test(c.h)), "expected an alt-text card");
    });
  });

  /* ---- copy must not make claims Google has retracted ---- */
  suite("copy accuracy", () => {
    const RETRACTED = [
      /dropped in search/i,
      /likely to be dropped from the SERP/i,
      /Google typically shows ~\d+ characters/i,
      /most likely to (?:be pulled into|earn) a featured snippet/i,
      /structure snippets and featured answers/i,
      /Keyphrase rare/i,
      /rarely covers a topic competitively/i,
      /tends to compete better/i,
    ];
    const fixtures = [
      { name: "empty", draft: {} },
      { name: "brief", draft: SHORT_BRIEF },
      { name: "long unstructure", draft: LONG_UNSTRUCTURED },
      { name: "long structured", draft: LONG_STRUCTURED },
      { name: "sample", draft: t.SAMPLE },
      { name: "stuffed", draft: { keyphrase: "keyboard", title: "KEYBOARDS", summary: "Keyboard".repeat(30), excerpt: "x".repeat(220), body: "keyboard ".repeat(400) } },
      { name: "long no cta", draft: { keyphrase: "budget mechanical keyboards", title: "How to choose", summary: "Here is some information about the topic in general.", excerpt: "Here is some information about the topic in general.", body: draftOf(1500, { blocks: 8, headings: 2 }) } },
    ];
    for (const { name, draft } of fixtures) {
      test(`no retracted SEO claims in "${name}"`, () => {
        const r = analyse(t, draft);
        const strings = [
          ...r.checks.map((c) => `${c.title} ${c.detail}`),
          ...r.cards.map((c) => `${c.h} ${c.why} ${c.text}`),
        ];
        for (const s of strings) {
          for (const re of RETRACTED) ok(!re.test(s), `copy matches ${re}: ${s.slice(0, 160)}`);
        }
      });
    }
    test("copy admits that FAQ rich results are gone", () => {
      const r = analyse(t, { body: draftOf(RULES.body.minWordsForFaq + 100, { blocks: 6 }) });
      const c = check(r, "body-faq");
      ok(c, "expected a FAQ check");
      ok(/rich result/i.test(c.detail) && /no longer/i.test(c.detail), `FAQ detail should state the deprecation: ${c.detail}`);
    });
  });

  /* ---- the sample draft must still demo the tool ---- */
  suite("sample draft", () => {
    test("is long enough to reach the format thresholds", () => {
      const bw = t.words(t.SAMPLE.body).length;
      ok(bw >= RULES.body.minWordsForFaq, `sample is ${bw} words, needs ${RULES.body.minWordsForFaq}`);
    });

    test("exercises a broad spread of suggestion cards", () => {
      const r = analyse(t, t.SAMPLE);
      const heads = cardHeads(r);
      const expected = [
        [/-i?heading|^Heading idea/i, "heading card"],
        [/Internal link idea|Citation idea/i, "link card"],
        [/Add a list/i, "list card"],
        [/Add an FAQ/i, "FAQ card"],
        [/Add a conclusion/i, "conclusion card"],
        [/Descriptive link anchors/i, "anchor card"],
        [/alt text/i, "alt-text card"],
        [/Split into two sentences|Shorten sentence|split by hand/i, "sentence card"],
        [/Summary/i, "summary card"],
        [/Excerpt/i, "excerpt card"],
      ];
      for (const [re, label] of expected) {
        ok(heads.some((h) => re.test(h)), `sample produced no ${label} (got: ${heads.join(" | ")})`);
      }
    });

    test("has a non-trivial score and no failing checks", () => {
      const r = analyse(t, t.SAMPLE);
      ok(r.score > 20, `sample score too low: ${r.score}`);
      const failing = r.checks.filter((c) => c.status === "fail");
      eq(failing, [], "failing checks in the sample");
    });
  });

  /* ---- plumbing: no orphans, no crashes, no unknown ids ---- */
  suite("plumbing", () => {
    const KNOWN = new Set([
      "title", "title-len", "title-kw", "title-hook", "title-caps", "title-emoji", "title-stuff",
      "summary", "summary-len", "summary-kw", "summary-cta", "summary-emoji",
      "excerpt", "excerpt-len", "excerpt-kw", "excerpt-dup", "excerpt-dup2", "excerpt-cta",
      "body", "body-len", "body-para", "body-paralen", "body-sent", "body-h", "body-h1",
      "body-il", "body-el", "body-list", "body-faq", "body-concl", "body-anchor", "body-alt",
      "body-kw", "body-intro", "body-hkw", "body-read", "body-trans", "body-passive",
    ]);

    test("empty draft analyses without throwing and skips everything", () => {
      const r = analyse(t, {});
      eq(r.checks.every((c) => c.status === "skip"), true, "all checks skip on an empty draft");
      eq(r.score, null, "no score without content");
    });

    test("every check id the app emits is a known id", () => {
      const seen = new Set();
      for (const draft of [SHORT_BRIEF, LONG_UNSTRUCTURED, LONG_STRUCTURED, t.SAMPLE, {}, { body: "x" }]) {
        for (const c of analyse(t, draft).checks) seen.add(c.id);
      }
      eq([...seen].filter((id) => !KNOWN.has(id)), [], "unknown check ids");
    });

    test("every satisfies id points at a check that exists", () => {
      for (const draft of [SHORT_BRIEF, LONG_UNSTRUCTURED, LONG_STRUCTURED, t.SAMPLE]) {
        const r = analyse(t, draft);
        const ids = new Set(r.checks.map((c) => c.id));
        for (const card of r.cards) {
          if (!card.satisfies) continue;
          ok(ids.has(card.satisfies), `card "${card.h}" satisfies unknown check ${card.satisfies}`);
        }
      }
    });

    test("cards only appear for checks that are failing", () => {
      for (const draft of [SHORT_BRIEF, LONG_UNSTRUCTURED, LONG_STRUCTURED, t.SAMPLE]) {
        const r = analyse(t, draft);
        const byId = new Map(r.checks.map((c) => [c.id, c]));
        for (const card of r.cards) {
          if (!card.satisfies) continue;
          const c = byId.get(card.satisfies);
          ok(c && (c.status === "warn" || c.status === "fail"),
            `card "${card.h}" exists but check ${card.satisfies} is ${c && c.status}`);
        }
      }
    });

    test("impact badges are non-negative and sorted descending", () => {
      const r = analyse(t, LONG_UNSTRUCTURED);
      const impacts = r.cards.map((c) => c.impact);
      for (const i of impacts) ok(i >= 0, `negative impact ${i}`);
      eq(impacts, impacts.slice().sort((a, b) => b - a), "card order");
    });

    test("appended heading fixes are exact substrings of the draft", () => {
      const r = analyse(t, LONG_UNSTRUCTURED);
      const cards = r.cards.filter((c) => c.fix && c.fix.find);
      ok(cards.length, "expected at least one fixable card");
      for (const c of cards) {
        ok(t.els.body.value.includes(c.fix.find), `fix anchor not found in draft: ${c.h}`);
        if (!c.fix.findOnly) ok(c.fix.replace && c.fix.replace.length > 0, `empty replacement for ${c.h}`);
      }
    });

    test("analysis is stable across repeated runs", () => {
      const a = analyse(t, t.SAMPLE);
      const b = analyse(t, t.SAMPLE);
      eq(a.score, b.score, "score stability");
      eq(cardHeads(a), cardHeads(b), "card stability");
    });

    test("auto-applied fixes reduce the thing they claim to fix", () => {
      const draft = { body: draftOf(700, { blocks: 5, headings: 0 }) };
      const before = analyse(t, draft);
      const card = before.cards.find((c) => c.fix && c.fix.verb === "Replace in draft");
      ok(card, "expected a replaceable card");
      // analyse() rewrites every field from the draft object, so carry the
      // patched body forward explicitly or the fix is thrown away.
      const patched = t.els.body.value.replace(card.fix.find, () => card.fix.replace);
      ok(patched !== draft.body, "the replacement did not change the draft");
      const after = analyse(t, { ...draft, body: patched });
      ok(after.cards.filter((c) => c.text === card.text).length < before.cards.filter((c) => c.text === card.text).length,
        "the fix did not clear its own suggestion");
    });
  });

  /* ---- untouched helpers still behave ---- */
  suite("helper regressions", () => {
    test("internal vs external link detection uses the site domain", () => {
      const r = t.parseLinks("[a](https://neowin.net/x) [b](https://other.com/y) [c](/z)", "neowin.net");
      eq(r.internal.length, 2, "internal links");
      eq(r.external.length, 1, "external links");
    });

    test("list lines count markdown, html and tables", () => {
      eq(t.countListLines("- a\n- b\n1. c\n<li>d</li>"), 4, "list lines");
    });

    test("conclusion detection reads headings and the tail", () => {
      ok(t.hasConclusion("### Conclusion\n\nIt is fine."), "heading conclusion");
      ok(t.hasConclusion("Some text.\n\nThe bottom line is that it works."), "tail conclusion");
      ok(!t.hasConclusion("Some text without any wrap-up at all."), "no conclusion");
    });

    test("excerpt overlap detection requires enough shared words", () => {
      ok(t.excerptSharesWith("one two three four five six", "one two three four five six"), "identical");
      ok(!t.excerptSharesWith("one two three four five six", "seven eight nine ten eleven twelve"), "disjoint");
    });

    test("keyword matching is word-boundary aware and tolerates a plural tail", () => {
      ok(t.hasKeyword("budget mechanical keyboards", "budget mechanical keyboards"), "exact");
      ok(t.hasKeyword("budget mechanical keyboards", "budget mechanical keyboard"), "plural form in the draft");
      ok(!t.hasKeyword("an article about the artist", "art"), "no match inside article/artist");
    });
  });

  /* ---- the whole render path, exercised the way a browser would ---- */
  suite("rendering", () => {
    const node = (id) => t.button(id);

    test("the app booted and reported itself ready", () => {
      ok(t.__ready, "window.__seoReady should be set");
    });

    test("Load sample fills every field and renders every panel", () => {
      const btn = t.button("btn-sample");
      ok(btn, "no sample button");
      btn.click();
      eq(t.els.keyphrase.value, t.SAMPLE.keyphrase, "keyphrase field");
      eq(t.els.body.value, t.SAMPLE.body, "body field");
      ok(t.els.checks.innerHTML.length > 200, "checks panel is empty");
      ok(t.els.suggestions.innerHTML.length > 200, "suggestions panel is empty");
      ok(t.els.stats.innerHTML.includes("Focus keyphrase"), "stats panel missing");
      ok(node("tone").innerHTML.length > 0, "tone panel is empty");
      ok(node("writing").innerHTML.length > 0, "writing panel is empty");
    });

    test("the score dial, verdict and count are populated", () => {
      ok(/^\d+$/.test(t.els.scoreNum.textContent), `score is "${t.els.scoreNum.textContent}"`);
      ok(t.els.verdict.textContent.length > 3, "verdict is empty");
      ok(/\d+\/\d+ checks passing/.test(t.els.scoreHint.textContent), `hint is "${t.els.scoreHint.textContent}"`);
    });

    test("hashtags and article tags are extracted from the sample", () => {
      ok(node("hashtags").innerHTML.includes("#"), "no hashtags rendered");
      ok(node("articletags").innerHTML.includes("chip tag"), "no article tags rendered");
    });

    test("rendered check markup carries a status badge for every check", () => {
      const badges = t.els.checks.innerHTML.match(/class="badge /g) || [];
      eq(badges.length, t.report.checks.length, "badge count vs check count");
    });

    test("Clear empties the fields and resets the checklist", () => {
      t.button("btn-sample").click();
      const undoAfterSample = t.button("btn-undo");
      ok(!undoAfterSample.disabled, "undo should be enabled after loading the sample");
      t.button("btn-clear").click();
      eq(t.els.body.value, "", "body after clear");
      eq(t.els.keyphrase.value, "", "keyphrase after clear");
      ok(t.report.checks.every((c) => c.status === "skip"), "every check should skip after Clear");
      undoAfterSample.click();
      eq(t.els.body.value, t.SAMPLE.body, "undo should restore the sample");
    });

    test("Undo rewinds a programmatic edit", () => {
      t.button("btn-sample").click();
      const before = t.els.body.value;
      const card = t.suggestions.find((c) => c.fix && c.fix.verb === "Insert heading")
        || t.suggestions.find((c) => c.fix && c.fix.verb === "Replace in draft");
      ok(card, "expected a card with a button that edits the draft");
      eq(before, t.SAMPLE.body, "sample should be loaded unmodified");
      t.pushUndo(card.h); // snapshot first, exactly like the button does
      t.els.body.value = t.els.body.value.replace(card.fix.find, () => card.fix.replace);
      ok(t.els.body.value !== before, "the edit did not change the draft");
      t.undoLast();
      eq(t.els.body.value, before, "undo did not restore the draft");
    });

    test("the Copy report action produces a non-empty report", () => {
      t.button("btn-sample").click();
      const text = t.reportText();
      ok(text.includes("SEO Article Review"), "report header missing");
      ok(text.includes("SUGGESTED EDITS"), "report has no suggestions section");
      ok(/score \d+\/100/.test(text), "report has no score");
    });

    test("every rendered suggestion is escaped and has a heading", () => {
      t.button("btn-sample").click();
      const html = t.els.suggestions.innerHTML;
      const cards = html.split("<div class=\"sug").length - 1;
      eq(cards, t.suggestions.length, "card count vs suggestion count");
      ok(!/<blockquote><\/blockquote>/.test(html), "an empty suggestion was rendered");
    });

    test("draft persistence round-trips through localStorage", () => {
      t.button("btn-clear").click();
      t.els.title.value = "A title that persists";
      t.els.body.value = "A body that persists.";
      t.saveDraft();
      t.els.title.value = "";
      t.els.body.value = "";
      t.loadDraft();
      eq(t.els.title.value, "A title that persists", "restored title");
      eq(t.els.body.value, "A body that persists.", "restored body");
      t.button("btn-clear").click();
    });
  });

  /* ---------------------------------------------------------------- report */
  let failed = 0, passed = 0;
  for (const s of results) {
    console.log(`\n${s.name}`);
    for (const tc of s.tests) {
      if (tc.ok) { passed++; if (VERBOSE) console.log(`  ok   ${tc.name}`); }
      else { failed++; console.log(`  FAIL ${tc.name}\n         ${tc.err}`); }
    }
    const good = s.tests.filter((x) => x.ok).length;
    console.log(`  ${good}/${s.tests.length} passed`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();


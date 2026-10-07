#!/usr/bin/env node
/* Regenerate the FALLBACK_RULES block in app.js from seo-rules.json.
   On a file:// open the fetch in loadRules() fails and every check and
   suggestion reads FALLBACK_RULES instead of the JSON, so the two copies have
   to be identical. This script rewrites the block; tests/run.js fails if they
   ever diverge. Run it after editing seo-rules.json:

     node tests/sync-fallback.js            # rewrite app.js
     node tests/sync-fallback.js --check    # exit 1 if app.js is stale        */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const rulesPath = path.join(root, "seo-rules.json");
const appPath = path.join(root, "app.js");

const START = "/* ---------- Built-in fallback rules";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Objects print inline when they fit one line, otherwise one key per line.
function fmt(value, indent) {
  if (Array.isArray(value)) return "[" + value.map((v) => JSON.stringify(v)).join(", ") + "]";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  const inline = "{ " + entries.map(([k, v]) => key(k) + ": " + fmt(v, indent)).join(", ") + " }";
  if (inline.length <= 108 && !inline.includes("\n")) return inline;
  const pad = indent + "  ";
  return "{\n" + entries.map(([k, v]) => pad + key(k) + ": " + fmt(v, pad) + ",\n").join("") + indent + "}";
}
const key = (k) => (IDENT.test(k) ? k : JSON.stringify(k));

// Word lists wrap so no single line runs away with the review.
function wrap(words, perLine, indent) {
  const out = [];
  for (let i = 0; i < words.length; i += perLine) {
    out.push(indent + words.slice(i, i + perLine).map((w) => JSON.stringify(w)).join(", ") + ",");
  }
  return out.join("\n");
}

function buildBlock(rules) {
  const groups = Object.entries(rules.rules)
    .map(([k, v]) => "    " + k + ": " + fmt(v, "    ") + ",")
    .join("\n");
  return `/* ---------- Built-in fallback rules (used only if the local file can't load) ----------
   MUST stay identical to seo-rules.json: on a file:// open the fetch in
   loadRules() fails and every check and suggestion reads THIS block instead,
   so a silent mismatch would quietly change behaviour. tests/run.js fails on
   any drift; regenerate with: node tests/sync-fallback.js                      */
const FALLBACK_RULES = {
  version: "built-in fallback",
  updated: ${JSON.stringify(rules.updated)},
  sources: ${fmt(rules.sources, "  ")},
  rules: {
${groups}
  },
  powerWords: [
${wrap(rules.powerWords, 7, "    ")}
  ],
  weakHookWords: [
${wrap(rules.weakHookWords, 11, "    ")}
  ],
};
`;
}

// Replace exactly the FALLBACK_RULES literal and nothing else. The end is found
// by matching a line that is exactly "};", and the span is sanity-checked
// before anything is written — a bad match here would silently delete whatever
// sits between the markers, so it refuses rather than guesses.
const MAX_BLOCK_LINES = 250;

function replaceBlock(src, block) {
  const start = src.indexOf(START);
  if (start < 0) throw new Error("could not find the fallback-rules marker in app.js");
  const decl = src.indexOf("const FALLBACK_RULES = {", start);
  if (decl < 0) throw new Error("could not find the FALLBACK_RULES declaration in app.js");

  const rest = src.slice(decl);
  const endMatch = /^};\r?\n/m.exec(rest);
  if (!endMatch) throw new Error("could not find the end of the FALLBACK_RULES block in app.js");
  const end = decl + endMatch.index + endMatch[0].length;

  const old = src.slice(start, end);
  if (!old.includes("const FALLBACK_RULES")) {
    throw new Error("refusing to rewrite: the located span is not the FALLBACK_RULES block");
  }
  const lines = old.split("\n").length;
  if (lines > MAX_BLOCK_LINES) {
    throw new Error(`refusing to rewrite: located span is ${lines} lines, expected under ${MAX_BLOCK_LINES}`);
  }
  if (/^(async )?function |^const [A-Z_]+ =|^let [A-Za-z]/m.test(old.replace(/^[\s\S]*?FALLBACK_RULES = \{/, ""))) {
    throw new Error("refusing to rewrite: the located span contains code outside the block");
  }
  return src.slice(0, start) + block + src.slice(end);
}

function main() {
  const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
  const app = fs.readFileSync(appPath, "utf8");
  const next = replaceBlock(app, buildBlock(rules));
  if (next === app) {
    console.log("fallback rules already in sync");
    return;
  }
  if (process.argv.includes("--check")) {
    console.error("FALLBACK_RULES in app.js is out of sync with seo-rules.json");
    console.error("run: node tests/sync-fallback.js");
    process.exit(1);
  }
  fs.writeFileSync(appPath, next);
  console.log("rewrote FALLBACK_RULES in app.js from seo-rules.json");
}

main();

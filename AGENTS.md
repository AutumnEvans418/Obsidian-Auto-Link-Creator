# Obsidian plugin — Auto Link Creator
- use rtk.

## Repo state (read this first)

- **Code is still sample scaffolding, not the real feature.** `src/main.ts` is the
  stock Obsidian sample plugin (`MyPlugin`, `SampleModal`, placeholder commands/ribbon/
  statusbar). The actual "Auto Link Creator" design + roadmap live in **`PLAN.md`**
  (linking formats, phrase-count NLP, variants/pluralization, aliases, preview).
  Manifest description and `README.md` describe *intended* features; only `PLAN.md`
  reflects reality. Build features from `PLAN.md`, not the README.
- Plugin id `obsidian-automatic-link-creator` (manifest) vs folder `Obsidian-Auto-Link-Creator`.
  Match `id` to the folder for local install; never change `id` after release.

## What to build (from PLAN.md)

Read `PLAN.md` before implementing; it is the authoritative spec. Core workflows:

- **Template/linked list syntax**: parse `- {{Link Name}} ({{Link Alias}}) - {{Link Content}}`
  style lists → create `[[Link Name|Link Alias]]` wiki links and the target notes.
- **Phrase-count NLP**: keyword extraction (frequency, stop-word removal, lemmatization,
  singularization) to detect repeated phrases worth linking. `Cow` ⇄ `Cows`, `Party` ⇄ `Parties`.
- **Variant/alias handling**: build alises for a note from its pluralized/normalized/lemmatized
  forms; skip adding a variant alias if already present; auto-create notes per setting.
- **Triggers**: link on save, process entire vault, and a **preview** modal of suggested
  links before applying. Preview is a key differentiator vs sibling plugins.
- **Avoid re-linking**: skip phrases already inside a wiki link, and notes a
  companion plugin (obsidian-automatic-linker) already handles.
- Reference implementations to borrow from: `kdnk/obsidian-automatic-linker`
  (link-on-save, aliases), `danrhodes/AutoKeywordLinker` (vault keyword scanning, preview).
- `PLAN.md` includes multiple link/output examples — use them as your fixtures.
- Leftover "sample"/`MyPlugin` naming in `package.json`, `README.md`, `settings.ts`,
  and `main.ts` is stale and should be renamed as part of real work. Note the
  circular import `settings.ts` ↔ `main.ts` (settings imports `MyPlugin` only for typing).

## Build checklist

Decisions locked in `ARCHITECTURE.md` (Q1–Q12 answered): use `nlp-compromise`;
single deduped `scanFile` pipeline; relative links are markdown `[text](path.md)`;
overlap link-detection; new notes in source folder (vault-wide: highest common
folder else root); existing note ⇒ **append** content to bottom; on-save + command
entry points gated by preview; undo wanted.

Implemented one at a time; tick off as done. Each item is small enough to verify
in Obsidian (reload plugin → run command/settings) **and** unit-tested where it
contains pure logic (via `npm test`, `node --test` — no framework). Pure logic
goes in obsidian-free modules under `src/` alongside `validation.ts`, then is
imported by the plugin files.
Add temp debug command so it can be tested in obsidian.
Add test when fixing bugs.

- [x] Ignore code blocks
- [x] `nlp-compromise` dep; wrap plural/singular/past/participle/root in obsidian-free `src/nlp.ts`
- [x] Template parser: match line vs templates (first match wins) → `ParsedTemplate {name, alias, content}`
- [x] Title casing: capitalize each first letter of Link Name
- [x] Variant generation: `{plural, singular, lemmatized, normalized}` set from a word via `nlp.ts`
- [x] Link detector: skip phrase whose token overlaps a `[[...]]` span
- [x] Link builders: wiki `[[Name|Alias]]` + markdown-relative `[text](path.md)` (URL-encoded path)
- [x] Keyword extractor: tokenize, strip stop-words/punctuation, frequency count, drop <3-char words
- [x] Note creator: create `Name.md` (alias frontmatter + content); if exists, append content to bottom.
- [x] If enabled, opens created file without switching active file so that undo works.
- [x] File scanner: single `scanFile` pipeline, template+phrase+variant passes combined + deduped
- [x] Folder resolution: same-folder; vault-wide highest common folder of referencing files else root
- [x] Process-single-file + on-save trigger (rewrites source to insert links)
- [x] Process-whole-vault command (scan all `.md`, resolve folders, batch apply)
- [x] Preview modal: suggested links + note content, select/apply before committing (gates destructive batch)
- [x] Settings: command on/off, on-save on/off toggles + relative-link, auto-create, capitalize
- [x] Idempotency test: second run near-no-op (notes exist ⇒ skip/append)
- [x] Undo/rollback of a preview apply (multi-file mutations)
- [x] Setting for template based keywords.
- [x] Setting for NLP based keywords.

- [ ] Add setting and feature to link existing note based on its file name or list of aliases, following the same capitalization rules if enabled. Instead of replacing a link with a new/non-existing file name, this will search the index for an existing note and use that if it matches. Different options for exact match or nlp root match. Use this plugin for inspiration:  https://github.com/kdnk/obsidian-automatic-linker. This plugin does basically that, except that it doesn't have nlp support.
## Commands (npm)

```bash
npm install          # install deps
npm run dev          # esbuild watch -> main.js. NO typecheck, NO lint
npm run build        # tsc -noEmit -skipLibCheck THEN esbuild prod (minified). Run for CI/gradable size.
npm run lint         # eslint (eslint-plugin-obsidianmd)
npm run version      # lifecycle hook of `npm version` — don't run directly
```

- `build` = typecheck + bundle. `dev` only bundles — if you only run `dev`, type
  errors still pass. Gate on `npm run build` or `tsc -noEmit -skipLibCheck`.
- CI runs `npm ci && npm run build --if-present && npm run lint`.

## Layout

- `src/main.ts` — plugin entry, lifecycle. Keep minimal.
- `src/settings.ts` — settings interface, `DEFAULT_SETTINGS`, settings tab.
- `PLAN.md` — product spec/feature roadmap (the source of truth for what to build).
- `main.js`, `main.js.map` — **generated**, gitignored, never commit.
- `esbuild.config.mjs` — bundles `src/main.ts` → `main.js` (cjs, es2021); `obsidian`,
  `electron`, `@codemirror/*`, `@lezer/*` external.
- `styles.css` optional; attached to release only if it exists.

## Scan / inspect

- tsconfig is `strict` with `noUncheckedIndexedAccess` — index access yields `T | undefined`.
- Target `es2021`, browser globals (Obsidian API). `isDesktopOnly: false` → no Node/Electron
  APIs except behind a platform guard.

## Release flow (don't leak build artifacts)

1. `npm version patch|minor|major` — bumps `package.json`, runs `version-bump.mjs`
   (syncs `manifest.json` version + adds `versions.json` entry, `git add`s them),
   tags **without `v` prefix** (`.npmrc`: `tag-version-prefix=""`). Update
   `manifest.json` `minAppVersion` first.
2. Push the tag. `.github/workflows/release.yml` builds and opens a **draft** release
   with `main.js`, `manifest.json`, `styles.css`.

## Gotchas

- Never commit `main.js` or `node_modules` (gitignored; `.map` ignored too).
- Register all DOM/app/interval listeners via `this.register*` so unload cleans up.
- Manual install: copy `main.js`, `manifest.json`, `styles.css` into the plugin folder
  in the vault, then reload Obsidian.

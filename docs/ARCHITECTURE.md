# Architecture — open questions

Answered by the author. Each Q blocks (or constrains) implementation; the build
checklist in `AGENTS.md` follows from the decisions.

## Libraries

- **NLP depth.** PLAN needs tokenize + stop-word strip + lemmatize + singularize
  (`Cow`⇄`Cows`, `Party`⇄`Parties`, `Changed`→`Change`). Obsidian plugins must be
  pure JS (no native deps). Two routes:
  - **A) Hand-rolled** small rule set + word-lookup dict. Zero deps, fast, but
    accuracy ceiling on irregular forms; "caveman-grade" English coverage.
  - **B)** A pure-JS NLP lib (`nlp-compromise`, `wink-nlp`, `node-nlp`) bundles
    into `main.js`. More coverage, bigger bundle, dependency to maintain.
  - Q1: hand-rolled or a lib? If a lib, which one (and is bundle size accepted)?
> Lets use. nlp-compromise. Better to not reinvent the wheel. https://github.com/spencermountain/compromise.
  - Q2: what corpus/forms do we actually need? Headwords only (de-en/plur/lemma), or full phrase n-grams for "keyword extraction"?
> plurals, past, present, past participle, root word (lemmatization).

- **Anything else?** No other obvious dependency. File reads/writes stay on the
  Obsidian `Vault` API (no `fs`). Confirm nothing else is expected.
> Agreed.

## Workflow — gaps / unclear parts in PLAN.md

- **Grand-noun location.** PLAN: "create file closest to where it's used." Where
  exactly — same folder as source note? Vault root? A `[[Name]]` link works from
  anywhere if name is unique, so "closest" is only about file *placement*, not
  resolution. Q3: is same-folder placement right, or always root/normalized path?
> Same-folder. When running the keyword finder across the entire vault, it will find the highest folder that the files that references match. If there are no mutual folders, it goes in root.

- **Three triggers overlap.** Template parser, phrase-count NLP, and variant scan
  can each propose a link for the *same* phrase in one run. Q4: single shared
  `scanFile` pipeline that dedupes, or three independent passes (later one wins)?
> yes, one pipeline for performance.

- **Relative-link meaning.** Setting lists "relative link." Relative to *what* —
  just the bare filename (`[[Name]]`), a leading-folder path from the vault root,
  or a path computed from the *referencing* note's folder? Obsidian wiki links are
  already vault-relative. Q5: what does "relative" alter vs the default `[[]]`?
> ex. [Three laws of motion](Projects/Three%20laws%20of%20motion.md). Default markdown format.

- **Don't-re-link boundaries.** "Skip phrases already inside `[[...]]`." A phrase
  is usually a substring of a wiki link (e.g. `[[Risk Appetite|risk appetite]]`).
  Q6: skip if the phrase token *overlaps* any `[[ ]]` span, or only if it's exactly a full link? (Overlap is safer, costlier.)
> Overlap.

- **Auto-create limits.** Auto-creating notes from a save/scan can create many files
  the user didn't intend. Q7: should auto-create be scoped (per workflow toggle,
  min-frequency threshold, folder allowlist) or global on/off? Any hard cap per run?
> command on/off. on save on/off.

- **Editing the target's frontmatter.** Adding a missing variant alias edits a note
  *other than* the one being saved. Q8: clear? Only mutate target frontmatter, never
  target body?
> Correct. If `note.md` says `- name (alias) - content`, then it creates `Name.md` with:

Note.md
```md
- [[Name]]
```

Name.md:
```md
---
aliases: [alias]
---
content
```



- **Source-file edit via preview.** Preview shows suggested links; "apply" replaces
  text in the *source* file as well as creating/linking notes. Q9: does apply also
  rewrite the source to insert `[[ ]]`, or only create/link the target notes?
> Creates the file as well as rewrite source.

- **Undo.** Nothing in PLAN. Applying a multi-file preview is destructive-ish. Q10:
  need any undo/rollback, or out of scope for v1?
> Currently have git, but Undo would be a good idea. should add to todo.

- **Command/trigger reconery.** On-save fires every save; process-vault runs over all
  files. Both share the pipeline. Q11: confirm the three entry points are
  (a) on-save hook, (b) process-vault command, (c) preview command — and preview is
  required before any destructive batch apply?
> yes. three options.

## Not architecture, but worth naming

- **Idempotency**: second run must be near-no-op because target notes now exist
  (collision guard). Fine by design — just confirming we lean on "note exists ⇒ skip."
> yes. would be something good to test.
- **Generated-note collision with *user* files**: collision guard skips only if name/alias
  exists. Q12: skip, or merge/append content when a generated target already holds
  user content?
> yes, we would append the content to the bottom of the note.

Numbered Q1–Q12 for easy answering.

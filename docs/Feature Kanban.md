---

kanban-plugin: board

---

## Todo


## Active



## Done

- [x] Namespace/folder note-level override stored in the frontmatter #feature Fix: a note can now pin its own folder namespace in frontmatter (`namespace: team-a`); when present it overrides the global scope for that note (it behaves as a 'folder' scope rooted at the declared folder), so its keywords/notes stay inside its namespace regardless of the global setting. Pure `src/scope.ts` additions — `frontmatterNamespace(doc)` (parses the leading frontmatter block, unquotes/normalizes the value, tolerates list/object values as unset) and `effectiveScope(s, namespace)` — are obsidian-free and unit-tested. Wired into the per-note entry points: `processFileAndPreview` creates new notes in the namespace folder; `vaultNoteIndex` and `linkExistingNotes` restrict candidate existing notes to the namespace. Vault-wide scan and the vault-context suggestion list intentionally keep global scope (no single active note there). Tests: test/scope.test.ts (+4: frontmatterNamespace parsing incl. absent/quoted/list cases, effectiveScope override/blank/trailing-slash, inScope+scopeFolderFor driven by a namespace) and test/commandService.test.ts (+1: doc with `namespace: proj` frontmatter creates `proj/Cow.md` and links `[[Cow]]` in the source). #feature

- [x] Proximity-based linking: link repeated phrases weighted by how close/nearby they occur (borrow automatic-linker's approach). #feature Fix: the per-file preview now ranks repeated-phrase suggestions by occurrence proximity — phrases whose occurrences cluster (short span for their count) lead the list, scattered ones trail. Ranking only: the suggestion set is unchanged, nothing is filtered or unlinked. Pure `src/proximity.ts` (`occurrenceLines`, `proximityScore` = count/span+1, `rankByProximity` stable sort by score then count) is obsidian-free and unit-tested. Template suggestions reuse their positional `hits[].lineIndex`; NLP suggestions (which carry no hits) are located in the source doc by scanning for the name + aliases + variant forms. Wired into `processFileAndPreview` after self-suggestion filtering, before preview. User confirmed: in-document occurrence proximity (not kdnk's path/shorthand disambiguation), rank-only. Tests: test/proximity.test.ts (7) + 1 command-service case. #feature

- [x] Namespace/folder scope: restrict keyword scanning and note creation to a chosen folder (or same-folder only), matching AutoKeywordLinker's scopes. #feature Fix: new **Namespace scope** setting (Scope dropdown: Vault-wide / Same folder only / Specific folder, plus a Scope folder path surfaced when Specific folder is chosen). Pure `src/scope.ts` (`inScope`, `scopeFolderFor`, `dirOf`) is obsidian-free and unit-tested. `inScope` gates which files the whole-vault scan reads (and which contribute to the NLP aggregate), the existing-note index used to fold variant references, and which files the vault-wide apply links into. `scopeFolderFor` clamps where new notes are created (folder scope → chosen folder, same-folder → the active note's folder) so keywords and notes stay inside the chosen namespace. Tests: test/scope.test.ts (6) + 2 command-service cases covering the scanning filter and note-creation placement. #feature

- [x] Import/export keywords: export discovered keywords/aliases to a file and re-import them so keyword sets survive vault moves. #feature Fix: new command pair "Export keywords to file" / "Import keywords from file" round-trips the discovered keyword set through a versioned JSON file (`auto-link-keywords.json` in the vault root) so keywords survive a vault move. Export gathers all three keyword types — existing-note names + frontmatter aliases (via `markdownFiles`/`noteAliases`), template suggestions, and NLP suggestions (from `collectVaultSuggestions`) — into `{name, aliases, content?}` records. Import re-materializes them as notes (create-or-append via the undoable writer, idempotent, gated on no parse errors). Pure `src/keywordIO.ts` (`KeywordRecord`, `serializeKeywords`, `parseKeywords`, `dedupeKeywords` case-insensitive merge) is obsidian-free and unit-tested; `exportKeywordFile`/`importKeywordFile` live in src/services/commandService.ts. Tests: test/keywordIO.test.ts (5) + 3 command-service cases. #feature
- [ ] Prevent linking + Preserve existing links: per-note/file opt-out from linking and guarantee already-linked text is never re-wrapped. #feature
- [x] Prevent self-linking: skip suggesting a link when the target note equals the current note (or the phrase already links back to it). #feature Fix: new obsidian-free `src/selfLink.ts` (`basenameOf`, `isSelfSuggestion`, `filterSelfSuggestions`, `filterSelfHits`) compares a suggestion/hit against the current note's basename via `sameReference` (so `Cows` ⇄ `Cow` count as self-links). Wired into every entry point: `linkTemplateKeywords` drops self-referential template hits before linking; `processFileAndPreview` filters the note's own suggestion from the note list, the vault-context list, and the apply path; `processVaultAndPreview` filters each file's template hits per-file at apply time so `Cow.md` never links `[[Cow]]` into itself while other files still link it. The "phrase already links back to it" half was already handled by the `[[...]]` span skip in the template scanner. Tests: `test/selfLink.test.ts` + 5 command-service cases. #feature
- [x] process entire vault is too slow #bug Fix: the vault-wide NLP pass no longer re-tokenizes every file on every run. `collectVaultSuggestions` now reconciles and reads the per-file n-gram cache (`ensureVaultCache`, keyed by mtime+opts) and aggregates the cached counts via new pure `vaultNgramAggregate`/`vaultKeywordHits` (src/vaultNlpCache.ts) — only changed files recount, and template-scan reads are skipped when template keywords are off. Warm reruns are near-instant: NLP becomes an in-memory merge of cached n-grams instead of 2-3× compromise tokenization per document.
- [x] process entire vault x out button on the preview does not work when it's in process. No way to cancel. Probably should be faster or run in background if too slow. #bug Fix: an `AbortController` is now threaded through `withLoading` → `processVaultAndPreview` → `collectVaultSuggestions` (src/main.ts, src/services/commandService.ts). Closing the scanning modal (X or Esc) aborts the scan via `LoadingModal.onClose`, `collectVaultSuggestions` returns `undefined` early, and no preview/notice is shown. Combined with the cache-driven speedup, the scan is faster and fully cancelable.
- [x] Add progress bar for preview 
	- processing entire vault if enabled + keyword finder
	- processing entire vault when checkbox is checked.
	#feature Fix: progress is threaded two ways. **Whole-vault command**: `collectVaultSuggestions` reports `(done,total)` once per scanned file and `LoadingModal` renders a real `<progress>` bar (`alcm-progress`, replacing its spinner) with a `done/total` count. **Vault-context checkbox** (already-open PreviewModal): the lazy `secondary.load(progress)` closure passes `(done,total)` from `ensureVaultCache`'s per-file cache rebuild into an in-modal `<progress>` under a "Scanning vault for keyword context" line. A shared exported `ProgressCallback = (done,total)=>void` type in `src/services/ipluginInterface.ts` keeps both paths uniform. Unit-tested via `processVaultAndPreview(plugin, cb)` in test/commandService.test.ts.
- [x] Remember preview filter selections such that reopening the preview screen pre-selects those options: sort, source, content, vault context #feature Fix: preview filter state is now centralized in `src/previewPrefs.ts` and persisted to `localStorage` (key `auto-link-creator.preview-prefs`) with an in-memory mirror, so reopening the modal restores the **Sort**, **Source**, **Has content**, and **Vault context** selections from the previous session. Corrupt/missing entries fall back to defaults; storage write errors are swallowed. Pure parse/save logic is obsidian-free and unit-tested.
- [x] Keywords shouldn't be case sensitive. For example, preview shouldn't show "Alias Support" and "Alias support" as separate keywords. #bug Fix: the apply path already deduped by case-insensitive reference, but the preview lists were shown raw — so template suggestions (title-cased) and NLP suggestions (which title-case the most frequent surface form) could both surface the same phrase under different casing as separate rows. `dedupeSuggestions` now runs before `plugin.preview` in both `processFileAndPreview` and `processVaultAndPreview`, so the preview shows each reference once, matching apply behavior.
- [x] fix github build https://github.com/AutumnEvans418/Obsidian-Auto-Link-Creator/actions #bug. Fix: CI `npm run build` died with rsync `error in file IO (code 11)` — the `sync` script rsync'd `./docs/` to the local-only `../../../Plugin/Link/` mirror, but in CI that parent `Plugin` dir wasn't creatable by bare rsync, so the build aborted. Added `mkdir -p ../../../Plugin/Link` before the rsyncs in the `sync` script (src package.json), letting the mirror be created in the runner. Verified `npm ci` + `npm run build` + `npm run lint` all exit 0 in a clean CI-depth clone.
- [x] #bug Formatting should not be included in note name and alias suggestions. ie: 
	Fix: `stripFormatting` (src/template.ts) now also strips leading heading/tag markers (`#`, `##`, `#name`) from captured names and aliases, alongside the existing handling for task-list checkboxes (`- [ ]`, `- [x]`), numbered prefixes (`1.`), and inline wrapping (`** *** ~~ __ *`). Applied to both name and alias (and `nameStart` stays correct for splice linking). Covers every case in the list. Tests added in test/template.test.ts.
	```
	- [ ] name
	- [x] name
	1. name
	**name**
	~~name~~
	***name***
	__name__
	#name
	```
	![[Pasted image 20260830202812.png]]
- [ ] Option on the preview screen to analyze the entire vault for nlp keywords in the current vault. Takes into account other notes in the vault when recommending keywords in the current note. #feature
- [x] nlp vault caching #feature. Fix: NLP results for the whole vault are now cached per-file as incremental n-gram counts and persisted to `vault-nlp-cache.json` (debounced 500 ms, flushed on unload), so the vault-context keyword list is computed once per changed file instead of rescanned every time. The cache is keyed by per-file mtime + settings (minWordLen, maxNgram, stopwords); a file only recounts when either changes. The "Vault context" list in the preview modal now lazy-loads in a background scan on first toggle, with a "Scanning vault for keyword context…" placeholder and "No vault-context keywords found." empty state. Applying a vault-context suggestion (listIndex 1) reuses the same cache and links the current note. #feature
- [x] Option to Match longer definitions even when a link already is in the name [[Typing Fail Example]]. Fix: new "Match longer definitions over already-linked words" setting (default off). When on, a phrase whose first words were already linked (e.g. `- [[Security]] Education Training Awareness (SETA) - …`) is still suggested; applying unwraps the shorter `[[Security]]` and links the whole `[[Security Education Training Awareness]]`. Fully-linked names stay skipped so re-runs stay idempotent.
- [x] Update auto link preview to include linking existing notes, not just making new ones. Fix: the preview now lists existing-note phrases as "existing note" suggestions (badge + no content); applying them links every occurrence to the existing note without creating or appending to it. Gated by the existing "Link phrases that match existing note names" setting.
- [x] Ignore html blocks. Fix: new "Ignore html blocks" setting skips lines that begin an HTML tag or comment (raw <div>, <iframe>, <!--), in both template and existing-note scans. Defaults off (current behavior preserved).
- [x] Disable the notice notifications on every linking. Fix: new "Disable notice notifications" setting suppresses the linking-results notice.
- [x] Add a front-matter property that when exists, disables auto link for that page. Fix: `auto-link: false` (also no/off/0) in a note's frontmatter opts that page out of all linking (template, NLP, existing-note, vault scan).
- [x] Numbered template support [[Before-TestNote#Numbered]]. Fix: numbered list templates (`1. {{Link Name}} - {{Link [[Content]]}}`) match any index (2., 4., …). Lines without a definition stay untouched unless a bare `1. {{Link Name}}` template is also added.
- [x] Diagram (mermaid) support. Fix: default scan leaves mermaid sequence diagrams byte-identical (arrows, colons, indent intact) — verified by test. With 'mermaid' on the **Code blocks to link** allowlist, phrases inside the diagram link while arrows/colons/indent are preserved (src/existingLinks.ts). #feature
- [x] Callout template. Fix: **templates now follow the line's leading shape** (src/template.ts). `> [!note] {{Link Name}}` matches a callout: title is the name, contiguous `> ` body lines become the description (content); inline-content form `> [!note] {{Name}} - {{Content}}` also works. #feature
- [x] Header, bolding, etc. Fix: existing-note linking wraps names inside headings, bold, italic, strikethrough, and `***` without disturbing the markers (existing-links tests). Literal-prefix templates (`# {{Link Name}} - {{Link Content}}`, `1. {{Link Name}}`, `[^1]: {{Link Name}}`) now match headers/numbered/footnote lines via the generic shape regex. #feature
- [x] Table template support. Fix: `| {{Link Name}} | {{Link Content}} |` reads first/second columns as name/definition; `| {{Name}} | {{Alias}} | {{Content}} |` reads all three. Separator rows (`| --- |`) rejected. Links inserted into cells escape the alias pipe (`[[Name\|Alias]]`) so the table stays intact (src/link.ts via `nameStart` splicing). #feature
- [x] Footnote template support. Fix: `[^1]: {{Link Name}}` matches any footnote reference number (digit-normalized head), and the existing-links pass wraps names inside `^[...]` footnotes. Explicit tests added. #feature
- [x] Setting to include/exclude unspecified code blocks, and to list allowed codeblocks for text to be linked (mermaid for example). Fix: **Code blocks to link** setting (comma-separated languages, e.g. mermaid) whose fenced-block contents are still linked when code blocks are ignored. Shared `makeCodeblockFilter` (src/validation.ts) drives both the template scanner (src/template.ts) and existing-note linking (src/existingLinks.ts), so ignore/allowlist now behave identically across both. #feature
- [x] Creating links inside a table does not work properly. [[Table Fail Example]] #bug
- [x] The "open files for undo" does not work. No files gets opened. #bug
- [x] Bug: Save after stop typing is not maintaining scroll correctly. Additionally, it loses cursor position. It's probably not accounting for the characters added after the update is made. Fix: `facade.set` no longer re-emits the whole document as a single transaction (which collapsed the caret to the end and unpinned the viewport, then restored stale coords that ignored chars inserted before the caret). New obsidian-free `minimalChanges` (src/textDiff.ts) emits only the changed lines, so CodeMirror maps the caret by the inserted delta and holds scroll natively; `setValue` fallback keeps the rAF restore. #bug
- [x] Process on save #feature
- [x] Preview changes #feature
- [x] Template matching #feature
- [x] NLP matching #feature
- [x] Match existing notes #feature
- [x] Alias support #feature
- [x] Auto file creation #feature
- [x] Capitalization #feature
- [x] Ignore code blocks #feature
- [x] `nlp-compromise` dep; wrap plural/singular/past/participle/root in obsidian-free `src/nlp.ts` #feature
- [x] Template parser: match line vs templates (first match wins) → `ParsedTemplate {name, alias, content}` #feature
- [x] Title casing: capitalize each first letter of Link Name #feature
- [x] Variant generation: `{plural, singular, lemmatized, normalized}` set from a word via `nlp.ts` #feature
- [x] Link detector: skip phrase whose token overlaps a `[[...]]` span #feature
- [x] Link builders: wiki `[[Name|Alias]]` + markdown-relative `[text](path.md)` (URL-encoded path) #feature
- [x] Keyword extractor: tokenize, strip stop-words/punctuation, frequency count, drop <3-char words #feature
- [x] Note creator: create `Name.md` (alias frontmatter + content); if exists, append content to bottom. #feature
- [x] If enabled, opens created file without switching active file so that undo works. #feature
- [x] File scanner: single `scanFile` pipeline, template+phrase+variant passes combined + deduped #feature
- [x] Folder resolution: same-folder; vault-wide highest common folder of referencing files else root #feature
- [x] Process-single-file + on-save trigger (rewrites source to insert links) #feature
- [x] Process-whole-vault command (scan all `.md`, resolve folders, batch apply) #feature
- [x] Preview modal: suggested links + note content, select/apply before committing (gates destructive batch) #feature
- [x] Settings: command on/off, on-save on/off toggles + relative-link, auto-create, capitalize #feature
- [x] Idempotency test: second run near-no-op (notes exist ⇒ skip/append) #feature
- [x] Undo/rollback of a preview apply (multi-file mutations) #feature
- [x] Setting for template based keywords. #feature
- [x] Setting for NLP based keywords. #feature
- [x] Add setting and feature to link existing note based on its file name or list of aliases, following the same capitalization rules if enabled. Instead of replacing a link with a new/non-existing file name, this will search the index for an existing note and use that if it matches. Different options for exact match or nlp root match. Use this plugin for inspiration: https://github.com/kdnk/obsidian-automatic-linker. This plugin does basically that, except that it doesn't have nlp support. #feature
- [x] Preserve scroll position on save. #feature
- [x] On save when dealing with checking for existing notes should use nlp to find close matches, such as plurals, and link them, if the setting is enabled. Armor Classes -> Armor Class (existing note) #feature
- [x] Bug: Add template is at the bottom of settings rather than other the template list. #bug
- [x] Bug: "Process current file and preview links" creates the suggested file, but doesn't actually create the link in the current file. Additionally, "--" was included as a keyword, which is unexpected. Fix: after creating notes, an `applyExistingLinks` pass links selected names/aliases in the source doc (NLP suggestions have no positional hits); template finders reject punctuation-only names like `--`. #bug
- [x] Bug: On save, front matter gets converted to links, which is unexpected. Fix: YAML frontmatter block is always skipped by template scanning and NLP keyword counting; new **Ignore dates** setting (default on) drops date/number-like phrases (`2026`, `2026-08-24T…`). #bug
- [x] Feature: Update the preview to present nlp, template, or both (default) keyword findings.  **Preview keyword findings** dropdown setting (`previewKeywords: 'both' | 'template' | 'nlp'`); `filterByPreviewMode` (src/ui/suggestion.ts) filters by provenance fields before preview in both preview flows; vault collector sets `nlpRoot` only when the NLP pass contributed. #feature
- [x] Feature: Create a setting in which you can set a folder for which new notes should be added to. Defaults to the current folder of the current note. There is another setting for two options. Subfolder, or Closest Shared Folder. If subfolder and set to "Concepts", then a "Concepts" subfolder will be created in the current note directory. If it's "Concepts" and set to closest shared, then it will check for the closest existing "Concepts" folder in the current dir and work up the parent tree. If none is found, then it will prompt for where to create it. Fix: **New note folder** setting (blank = source note's folder) + **New folder mode** dropdown (Subfolder default / Closest shared folder). Pure `resolveTargetFolder` (src/folders.ts); `targetFolder()` in commandService resolves per apply run — closest-miss prompts once per run via `promptFolder` (modal in main.ts), cancel falls back to subfolder. Vault flow applies it to each group's targetFolder. Facade `create` now mkdirs missing parents; manifest minAppVersion bumped 1.1.0→1.4.0 (Vault.createFolder). #feature
- [x] Bug: Update existing links on save should maintain scroll. Fix: defer scroll/cursor restore in `set()` via `requestAnimationFrame` so Obsidian's post-save layout settles first. #bug
- [x] Feature: Update on save should match the longest existing link/file/alias. For example, if the text says "Information Assets" and the following links exist: "Information", "Information Assets", "Information Assets" should be the link that created. Fix: sort tiebreaker in `applyExistingLinks` (`b.end - a.end`) ensures longest match at same start position wins; overlap rejection then drops shorter candidates. #feature
- [x] Feature: Proximity note wins. #feature
- [x] Feature: Link unresolved links. #feature




%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false]}
```
%%
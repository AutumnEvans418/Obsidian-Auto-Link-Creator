---

kanban-plugin: board

---

## Todo

- [ ] Update auto link preview to include linking existing notes, not just making new ones. #feature
- [ ] Currently as you type, it links existing notes, but when showing Auto link preview, it won't make certain suggestions because some of the words in the template were already linked, which means it has to be fixed by hand. Might be nice to have a way to override it. Option to Match longer definitions even when a link already is in the name. [[Typing Fail Example]] #feature


## Active

- [ ] Ignore html blocks #feature
- [ ] Disable the notice notifications on every linking. #feature
- [ ] Add a front-matter property that when exists, disables auto link for that page. #feature
- [ ] Numbered template support [[Before-TestNote#Numbered]] #feature


## Done

**Complete**
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
---

kanban-plugin: board

---

## Todo



## Active



## Done

- [x] Option to Match longer definitions even when a link already is in the name [[Typing Fail Example]]. Fix: new "Match longer definitions over already-linked words" setting (default off). When on, a phrase whose first words were already linked (e.g. `- [[Security]] Education Training Awareness (SETA) - …`) is still suggested; applying unwraps the shorter `[[Security]]` and links the whole `[[Security Education Training Awareness]]`. Fully-linked names stay skipped so re-runs stay idempotent.
- [x] Update auto link preview to include linking existing notes, not just making new ones. Fix: the preview now lists existing-note phrases as "existing note" suggestions (badge + no content); applying them links every occurrence to the existing note without creating or appending to it. Gated by the existing "Link phrases that match existing note names" setting.
- [x] Ignore html blocks. Fix: new "Ignore html blocks" setting skips lines that begin an HTML tag or comment (raw <div>, <iframe>, <!--), in both template and existing-note scans. Defaults off (current behavior preserved).
- [x] Disable the notice notifications on every linking. Fix: new "Disable notice notifications" setting suppresses the linking-results notice.
- [x] Add a front-matter property that when exists, disables auto link for that page. Fix: `auto-link: false` (also no/off/0) in a note's frontmatter opts that page out of all linking (template, NLP, existing-note, vault scan).
- [x] Numbered template support [[Before-TestNote#Numbered]]. Fix: numbered list templates (`1. {{Link Name}} - {{Link [[Content]]}}`) match any index (2., 4., …). Lines without a definition stay untouched unless a bare `1. {{Link Name}}` template is also added.




%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false]}
```
%%
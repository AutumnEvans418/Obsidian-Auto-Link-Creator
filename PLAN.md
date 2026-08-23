Given a certain format, convert the notes into links.
- Clone existing plugins for inspiration
- Build on top of the features to support file based linking and aliases.
- Add unit testing.

# Existing Plugins
- https://github.com/kdnk/obsidian-automatic-linker
	- Features
		- Process on save.
		- [[Process]] entire vault.
		- Proximity-based linking
		- Namespace scope
		- Closest match selection
		- Url formatting
		- Alias support
		- Prevent Linking
		- Prevent Self-Linking
		- Preserve Existing Links
	- What I like
		- Links on save.
		- Proximity.
		- Alias support.
		- Driven just by file and frontmatter information.
	- What's missing
		- Doesn't detect new useful links.
		- Long phrases/words that are repeated multiple [[Time|time]]s in  the document.
		- Phrases that match the defined templates.
		- A way to prompt before actually linking. (Preview)
		- Plural handling automatically. Time and times are likely the same thing.
- https://github.com/danrhodes/AutoKeywordLinker
	- Features
		- Keyword driven.
		- Automatically links notes based on keywords.
		- Automatic backlinks
		- Process entire vault
		- Keyword variations (aliases)
		- Preview
		- Scopes (restrict keywords to folders)
			- Same folder only
		- Smart keyword suggestion [[System|system]]
			- scans markdown
			- extracts common phrases
			- filters stop words
			- uses frequency count
			- provides preview for keywords or variants (create new or assign to existing keyword)
		- suggestion modal
		- relative linking
		- add tags
		- import/export keywords
	- What I like
		- Suggests "keywords" from the vault.
		- Process on save
		- Process entire vault
		- Handles variations (aliases)
		- Has a preview (modal)
	- What's missing
		- Keywords is another [[Data|data]] system on top of .md files that is unnecessary. Adds extra complexity.
		- Doesn't detect keyword patterns that can be turned into links.
# Features
- Process on save
	- On save, automatically creates links.
- Preview changes
	- When command ran, prompts with suggested links to create.
- Process entire vault
	- When command ran, scan vault and suggest links to create, along with the note content.
- Workflow
	- File Saved
		- Scan File based on formats
			- For each found
				- Parse Link Name, Alias, Content
				- If a link already exists in vault with same name or aliases, skip. The other plugin will handle it.
				- If phrase already contains a link, skip.
				- Capitalize each first letter of Link Name.
				- Convert to `[[]]` or relative link depending on setting.
				- Create a markdown file with Link Content and Aliases.
		- Scan File based on phrase count
			- Perform keyword extraction. NLP.
			- For each found
				- If a note already exists with same name or aliases, skip. The other plugin will handle it.
				- If already contains a link, skip.
				- Capitalize each first letter of Link Name.
				- Convert to `[[]]` or relative link depending on setting.
		- Scan File for variants
			- Lemmatization (Changed/Changing -> Change)
			- Singularization (Cows -> Cow)
			- For each word/phrase
				- Calculate variants (pluralized, nonpluralized, lemmatized, normalized)
					- Cow -> (Cow, Cows)
					- Parties -> (Party, Parties)
				- If variant does not match link in vault, skip.
				- If note does not exist, create it (depending on [[Set|set]]ting).
				- If note exists and note has all variants in aliases, skip.
				- If note exists and note is missing a variant, add it.
				- Show notification indicating the change was made.
	- Find Existing Keywords
		- Perform NLP
		- Normalize
		- Remove Stop words
		- Remove punctuation
		- Find Variants
		- Lemmatize
		- Preview potential keywords
		- Select all/none/combine.
		- For each keyword
			- Create file closest to where it's used.
			- Add aliases.
			- Add content.
- Alias support
- Automatically create markdown file with definition.
- Utilizes aliases as well.
- Checks for pluralization.
- Could build off of this plugin: obsidian://show-plugin?id=automatic-linker
- https://github.com/kdnk/obsidian-automatic-linker
- Capitalizes words in links automatically
- 
# Template
```
- {{Link Name}} ({{Link Alias}}) - {{Link Content}}

```

```
- {{Link Name}} ({{Link Alias}})
  - {{Link Content}}
  - {{Link Content}}
  - {{Link Content}}
```

# Example
```md
- Risk Appetite - Level of risk accepted by a company in terms of quantity and severity.
- Access control systems (ACS)
  - Identification
  - Authentication
  - Authorization
```

Results in:
```
- [[Risk Appetite]]
- [[Access Control Systems]]
```

# Resources
- Keyword Extraction
	- https://www.geeksforgeeks.org/nlp/keyword-extraction-methods-in-nlp/
- Topic [[Model]]ing
	- LDA
	- 
This is your new *vault*.

Make a note of something, [[create a link]], or try [the Importer](https://help.obsidian.md/Plugins/Importer)!

When you're ready, delete this note and make the vault your own.

- [[Test2]] (alias32)
	- [[Content1]]
	- [[Content2]]
> should create alias32 link with markdown file [[Test2]].md and content 
> - content1
> - content2

- [[Test3]] (alias) - content
> should be [[Test3]].md with alias link and content:
> - content

- [[Risk Appetite]] - Level of risk accepted.
- [[Access Control Systems]] (ACS) - Controls who enters.
- [[Risk Appetites]] - level of risk
> The above should be treated as the same reference as the above.

> The front matter for the added files should add:
```
---
aliases: [alias]
---
- content1
- content2
...
```

- [[Armor Class]] (AC) - The damage threshold
- [[Armor Classes]]
- [[Test]]

> Expectation:
> 5 files created.
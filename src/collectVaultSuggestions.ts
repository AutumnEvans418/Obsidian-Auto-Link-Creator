import type { IPlugin } from './services/ipluginInterface.ts';
import { closestCommonFolder } from './folders.ts';
import { extractKeywords, extractKeywordsFromDocs } from './keywords.ts';
import { rootForm } from './nlp.ts';
import type { AutoLinkSettings } from './settingsSchema.ts';
import { type ParsedTemplate, groupByReference, findAllByTemplates, groupContent } from './template.ts';
import type { Suggestion } from './ui/suggestion.ts';

/** Merge per-file hits into vault-wide suggestions with resolved folders. */
export async function collectVaultSuggestions(
	plugin: IPlugin,
	s: AutoLinkSettings): Promise<Suggestion[]> {
	const extra = s.extraStopwords.split(',').map((x) => x.trim()).filter(Boolean);
	// Existing note names keyed by root form, so variant forms fold onto them.
	const existingNotes = new Map<string, string>();
	for (const f of plugin.markdownFiles()) {
		const bare = f.basename;
		existingNotes.set(rootForm(bare.toLowerCase()), bare);
	}
	const acc = new Map<
		string,
		{
			name: string;
			aliases: Set<string>;
			contents: string[];
			hits: ParsedTemplate[];
			files: Set<string>;
			count: number;
		}
	>();
	const entry = (name: string) => {
		const preferred = existingNotes.get(rootForm(name.toLowerCase()));
		const resolved = preferred ?? name;
		const e = { name: resolved, aliases: new Set<string>(), contents: [], hits: [], files: new Set<string>(), count: 0 };
		acc.set(rootForm(name.toLowerCase()), e);
		return e;
	};

	// NLP: map every phrase to the files it appears in, using a per-file scan
	// with minimum frequency 1 so membership is tracked even for cross-file
	// phrases that never repeat within one note.
	const nlpFiles = new Map<string, Set<string>>();
	const docs: string[] = [];
	for (const file of plugin.markdownFiles()) {
		const doc = await plugin.read(file.path);
		docs.push(doc);
		if (s.enableTemplateKeywords) {
			for (const group of groupByReference(
				findAllByTemplates(doc, s.templates, { ignoreCodeblocks: s.ignoreCodeblocks })
			)) {
				const lead = group[0];
				if (!lead) continue;
				const e = acc.get(rootForm(lead.name.toLowerCase())) ?? entry(lead.name);
				for (const h of group) {
					if (h.name !== e.name) e.aliases.add(h.name);
					if (h.alias && h.alias !== e.name) e.aliases.add(h.alias);
				}
				e.hits.push(...group);
				e.files.add(file.path);
				e.count += group.length;
				const content = groupContent(group);
				if (content && !e.contents.includes(content)) e.contents.push(content);
			}
		}
		if (s.enableNlpKeywords) {
			for (const k of extractKeywords(doc, { extraStopwords: extra, minFreq: 1 })) {
				const set = nlpFiles.get(k.name.toLowerCase()) ?? new Set<string>();
				set.add(file.path);
				nlpFiles.set(k.name.toLowerCase(), set);
			}
		}
	}

	if (s.enableNlpKeywords) {
		for (const k of extractKeywordsFromDocs(docs, { extraStopwords: extra })) {
			const e = acc.get(rootForm(k.name.toLowerCase())) ?? entry(k.name);
			for (const a of k.aliases) if (a !== e.name) e.aliases.add(a);
			for (const f of nlpFiles.get(k.name.toLowerCase()) ?? []) e.files.add(f);
			e.count += k.count;
		}
	}

	return [...acc.values()].map((e) => {
		const files = [...e.files];
		const templates: string[] = [];
		for (const h of e.hits) {
			if (h.template && !templates.includes(h.template)) templates.push(h.template);
		}
		return {
			name: e.name,
			aliases: [...e.aliases],
			content: e.contents.length ? e.contents.join('\n\n') : undefined,
			count: e.count,
			hits: e.hits,
			sources: files,
			templates: templates.length ? templates : undefined,
			nlpRoot: rootForm(e.name.toLowerCase()),
			targetFolder: closestCommonFolder(files),
		};
	});
}

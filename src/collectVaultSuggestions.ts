import type { IPlugin } from './services/ipluginInterface.ts';
import { closestCommonFolder } from './folders.ts';
import { extractKeywords, extractKeywordsFromDocs } from './keywords.ts';
import { rootForm, variantForms } from './nlp.ts';
import { buildNoteIndex } from './existingLinks.ts';
import type { IndexEntry } from './existingLinks.ts';
import type { AutoLinkSettings } from './settingsSchema.ts';
import { type ParsedTemplate, groupByReference, findAllByTemplates, groupContent } from './template.ts';
import type { Suggestion } from './ui/suggestion.ts';

/** Resolve a name to an existing note whose basename/alias shares a form. */
function existingNoteResolver(plugin: IPlugin, mode: AutoLinkSettings['existingMatchMode']) {
	const entries: IndexEntry[] = plugin.markdownFiles().map((f) => ({
		path: f.path,
		basename: f.basename,
		aliases: plugin.noteAliases(f.path),
	}));
	const idx = buildNoteIndex(entries, mode);
	return (name: string): string | undefined => {
		for (const form of [name.toLowerCase(), ...variantForms(name.toLowerCase())]) {
			const base = idx.get(form);
			if (base) return base;
		}
		return undefined;
	};
}

/** Merge per-file hits into vault-wide suggestions with resolved folders. */
export async function collectVaultSuggestions(
	plugin: IPlugin,
	s: AutoLinkSettings): Promise<Suggestion[]> {
	const extra = s.extraStopwords.split(',').map((x) => x.trim()).filter(Boolean);
	// Fold variant references onto existing notes ("Armor Classes" → "Armor Class").
	const resolveExisting = existingNoteResolver(plugin, s.existingMatchMode);
	interface Acc {
		name: string;
		aliases: Set<string>;
		contents: string[];
		hits: ParsedTemplate[];
		files: Set<string>;
		count: number;
		nlpCount: number;
	}
	const acc: Acc[] = [];
	const entry = (name: string): Acc => {
		const resolved = resolveExisting(name) ?? name;
		const e: Acc = { name: resolved, aliases: new Set<string>(), contents: [], hits: [], files: new Set<string>(), count: 0, nlpCount: 0 };
		acc.push(e);
		return e;
	};
	const findEntry = (name: string): Acc | undefined =>
		acc.find((e) =>
			e.name.toLowerCase() === name.toLowerCase() || variantForms(e.name.toLowerCase()).some((f) => variantForms(name.toLowerCase()).includes(f)),
		);

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
				findAllByTemplates(doc, s.templates, {
				ignoreCodeblocks: s.ignoreCodeblocks,
				ignoreDates: s.ignoreDates,
				allowedCodeblocks: s.allowedCodeblocks,
			})
			)) {
				const lead = group[0];
				if (!lead) continue;
				const e = findEntry(lead.name) ?? entry(lead.name);
				for (const h of group) {
					if (h.name !== e.name) {
						e.aliases.add(h.name);
						if (!h.target) h.target = e.name;
					}
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
			const e = findEntry(k.name) ?? entry(k.name);
			for (const a of k.aliases) if (a !== e.name) e.aliases.add(a);
			for (const f of nlpFiles.get(k.name.toLowerCase()) ?? []) e.files.add(f);
			e.count += k.count;
			e.nlpCount += k.count;
		}
	}

	return [...acc].map((e) => {
		const files = [...e.files];
		const templates: string[] = [];
		for (const h of e.hits) {
			if (h.template && !templates.includes(h.template)) templates.push(h.template);
		}
		// Variant forms (plural/singular/root) so template-only groups still
		// create notes with aliases.
		for (const a of variantForms(e.name)) if (a !== e.name) e.aliases.add(a);
		return {
			name: e.name,
			aliases: [...e.aliases],
			content: e.contents.length ? e.contents.join('\n\n') : undefined,
			count: e.count,
			hits: e.hits,
			sources: files,
			templates: templates.length ? templates : undefined,
			// nlpRoot only when the NLP pass contributed, so preview source
			// filtering can tell template-only findings apart.
			nlpRoot: e.nlpCount ? rootForm(e.name.toLowerCase()) : undefined,
			targetFolder: closestCommonFolder(files),
		};
	});
}

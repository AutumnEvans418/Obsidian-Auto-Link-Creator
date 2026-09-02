import type { IPlugin, ProgressCallback } from './services/ipluginInterface.ts';
import { closestCommonFolder } from './folders.ts';
import { rootForm, variantForms } from './nlp.ts';
import { buildNoteIndex } from './existingLinks.ts';
import type { IndexEntry } from './existingLinks.ts';
import type { AutoLinkSettings } from './settingsSchema.ts';
import { type ParsedTemplate, groupByReference, findAllByTemplates, groupContent } from './template.ts';
import { vaultKeywordHits } from './vaultNlpCache.ts';
import type { Suggestion } from './ui/suggestion.ts';
import { inScope } from './scope.ts';

/** Resolve a name to an existing note whose basename/alias shares a form. */
function existingNoteResolver(plugin: IPlugin, mode: AutoLinkSettings['existingMatchMode'], sourceFolder?: string) {
	const s = plugin.settings;
	const entries: IndexEntry[] = plugin.markdownFiles()
		.filter((f) => inScope(f.path, s, sourceFolder))
		.map((f) => ({
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
	s: AutoLinkSettings,
	onProgress?: ProgressCallback,
	signal?: AbortSignal): Promise<Suggestion[] | undefined> {
	const extra = s.extraStopwords.split(',').map((x) => x.trim()).filter(Boolean);
	// Namespace scope: only scanner/index files inside the scope participate.
	const sourceFolder = plugin.folder();
	// Fold variant references onto existing notes ("Armor Classes" → "Armor Class").
	const resolveExisting = existingNoteResolver(plugin, s.existingMatchMode, sourceFolder);
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

	// Reconcile the per-file n-gram cache so unchanged files skip recounting,
	// then aggregate NLP across the whole vault from cached counts instead of
	// re-tokenizing every document (the dominant cost on warm runs).
	if (s.enableNlpKeywords) await plugin.ensureVaultCache({ extraStopwords: extra }, onProgress);
	if (signal?.aborted) return undefined;

	// Template pass: template hits live only per-file, so every file is still
	// read, but NLP no longer re-tokenizes each one.
	const files = plugin.markdownFiles().filter((f) => inScope(f.path, s, sourceFolder));
	const total = files.length;
	let done = 0;
	for (const file of files) {
		const doc = s.enableTemplateKeywords ? await plugin.read(file.path) : '';
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
		done++;
		onProgress?.(done, total);
		if (signal?.aborted) return undefined;
	}

	if (s.enableNlpKeywords) {
		for (const k of vaultKeywordHits(plugin.getVaultCache(), 2)) {
			const scoped = [...k.files].filter((f) => inScope(f, s, sourceFolder));
			if (!scoped.length) continue;
			const e = findEntry(k.name) ?? entry(k.name);
			for (const a of k.aliases) if (a !== e.name) e.aliases.add(a);
			for (const f of scoped) e.files.add(f);
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

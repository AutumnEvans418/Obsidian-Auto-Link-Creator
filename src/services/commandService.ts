import { collectSuggestions, dedupeSuggestions } from "../collectSuggestions.ts";
import { collectVaultSuggestions } from "../collectVaultSuggestions.ts";
import { createNote } from "../creator.ts";
import { resolveTargetFolder } from "../folders.ts";
import {
	applyExistingLinks,
	buildNoteIndex,
	findExistingHits,
	foldHitTargets,
} from "../existingLinks.ts";
import type { IndexEntry } from "../existingLinks.ts";
import { applyLinks } from "../link.ts";
import { variantForms } from "../nlp.ts";
import type { Suggestion } from "../ui/suggestion.ts";
import { basenameOf, filterSelfHits, filterSelfSuggestions } from "../selfLink.ts";
import { nlpSuggestions } from "../nlpSuggestions.ts";
import { inScope, scopeFolderFor, effectiveScope, frontmatterNamespace } from "../scope.ts";
import { occurrenceLines, rankByProximity } from "../proximity.ts";
import { parseKeywords, serializeKeywords, type KeywordRecord } from "../keywordIO.ts";
import { findAllByTemplates } from "../template.ts";
import type { ParsedTemplate } from "../template.ts";
import { frontmatterDisabled } from "../validation.ts";
import type { IPlugin, ProgressCallback } from "./ipluginInterface.ts";

const DISABLE_FRONTMATTER_KEY = 'auto-link';

/** Note index over the vault's markdown files, per the existing-match mode. */
function vaultNoteIndex(plugin: IPlugin, doc?: string): Map<string, string> {
	const effScope = effectiveScope(plugin.settings, doc ? frontmatterNamespace(doc) : '');
	const entries: IndexEntry[] = plugin.markdownFiles()
		.filter((f) => inScope(f.path, effScope, plugin.folder()))
		.map((f) => ({
			path: f.path,
			basename: f.basename,
			aliases: plugin.noteAliases(f.path),
		}));
	return buildNoteIndex(entries, plugin.settings.existingMatchMode);
}

/** Template-scan options shared by every entry point. */
function scanOpts(plugin: IPlugin) {
	return {
		ignoreCodeblocks: plugin.settings.ignoreCodeblocks,
		ignoreDates: plugin.settings.ignoreDates,
		allowedCodeblocks: plugin.settings.allowedCodeblocks,
		ignoreHtml: plugin.settings.ignoreHtml,
		matchLongerAcrossLinks: plugin.settings.matchLongerAcrossLinks,
	};
}

/** True when the given doc's frontmatter opts the page out of auto-linking. */
function disabledFor(doc: string): boolean {
	return frontmatterDisabled(doc, DISABLE_FRONTMATTER_KEY);
}

/** Index mapping a selected group's name/alias/variant forms → its name. */
function groupIndex(groups: Array<{ name: string; aliases: string[] }>): Map<string, string> {
	const idx = new Map<string, string>();
	for (const g of groups) {
		for (const form of [
			g.name.toLowerCase(),
			...g.aliases.map((a) => a.toLowerCase()),
			...variantForms(g.name.toLowerCase()),
		]) {
			if (!idx.has(form)) idx.set(form, g.name);
		}
	}
	return idx;
}

/**
 * Folder new notes go into per `newNoteFolder`/`newFolderMode`. When the
 * closest-mode search finds nothing, prompt once per apply run and reuse
 * the answer for later groups; cancel/no-prompt falls back to a subfolder.
 */
async function targetFolder(
	plugin: IPlugin,
	base: string,
	promptCache: { value?: string | null },
): Promise<string> {
	const name = plugin.settings.newNoteFolder;
	let resolved = resolveTargetFolder(base, name, plugin.settings.newFolderMode, (p) =>
		plugin.folderExists?.(p) ?? false,
	);
	if (resolved === null && plugin.promptFolder) {
		if (promptCache.value === undefined)
			promptCache.value = await plugin.promptFolder(base ? `${base}/${name}` : name);
		resolved = promptCache.value;
	}
	return resolved ?? (base ? `${base}/${name}` : name);
}

/** Rewrite template keyword lines in `plugin`'s doc into wiki links, idempotently. */
export function linkTemplateKeywords(plugin: IPlugin, quiet = false): void {
	const doc = plugin.value();
	if (disabledFor(doc)) return;
	let hits = findAllByTemplates(doc, plugin.settings.templates, scanOpts(plugin));
	if (!hits.length) {
		if (!quiet) plugin.notice('No template matches found.');
		return;
	}
	// Fold variant references onto existing notes (Armor Classes → Armor Class),
	// then drop hits that would link the note back to itself.
	foldHitTargets(hits, vaultNoteIndex(plugin, doc));
	hits = filterSelfHits(hits, basenameOf(plugin.source()));
	if (!hits.length) {
		if (!quiet) plugin.notice('No template matches found.');
		return;
	}
	plugin.set(applyLinks(doc, hits, plugin.settings.capitalize));
	plugin.notice(`Linked ${hits.length} keyword(s).`);
}

/**
 * NLP options from settings (stop words, phrase length, n-gram width).
 */
function nlpOpts(plugin: IPlugin) {
	const extra = plugin.settings.extraStopwords.split(',').map((s) => s.trim()).filter(Boolean);
	return { extraStopwords: extra };
}

/**
 * Preview suggestions for the active file; applying creates notes + links.
 * When NLP is enabled, also offers a vault-context suggestion list the modal
 * can toggle to. The vault-context list is built lazily (first time the user
 * switches to it) from a per-file n-gram cache, so opening the modal never
 * forces a full vault scan.
 */
export async function processFileAndPreview(plugin: IPlugin): Promise<void> {
	const doc = plugin.value();
	if (disabledFor(doc)) return;
	const effScope = effectiveScope(plugin.settings, frontmatterNamespace(doc));
	const folder = plugin.folder();
	const source = plugin.source();
	const selfName = basenameOf(source);
	let found: Suggestion[] = [];
	if (plugin.settings.enableTemplateKeywords) {
		found.push(
			...collectSuggestions(
				findAllByTemplates(doc, plugin.settings.templates, scanOpts(plugin)),
				source || undefined,
			),
		);
	}
	if (plugin.settings.enableNlpKeywords) {
		const nlpFound = nlpSuggestions(doc, nlpOpts(plugin).extraStopwords);
		if (source) for (const s of nlpFound) s.sources = [source];
		found.push(...nlpFound);
	}
	if (plugin.settings.enableExistingLinks) {
		const excludeBasename = source.split('/').pop()?.replace(/\.md$/i, '');
		const hits = findExistingHits(
			doc,
			vaultNoteIndex(plugin, doc),
			{
				...scanOpts(plugin),
				capitalize: plugin.settings.capitalize,
				excludeBasename,
			},
		);
		const byBase = new Map<string, Suggestion>();
		for (const h of hits) {
			let s = byBase.get(h.basename);
			if (!s) {
				s = { name: h.basename, aliases: [], hits: [], count: 0, existing: true };
				byBase.set(h.basename, s);
			}
			s.hits.push({
				name: h.surface,
				target: h.basename,
				lineIndex: h.lineIndex,
				nameStart: h.start,
			});
			s.count = (s.count ?? 0) + 1;
		}
		found.push(...byBase.values());
	}
	found = filterSelfSuggestions(found, selfName);
	if (!found.length && !plugin.settings.enableNlpKeywords) {
		plugin.notice('No keyword matches found.');
		return;
	}
	// Rank suggestions by occurrence proximity: phrases whose occurrences
	// cluster in the note rank higher. Ranking only — the set is unchanged.
	found = rankByProximity(found, (s) =>
		s.hits?.length
			? s.hits.map((h) => h.lineIndex)
			: occurrenceLines(doc, [s.name, ...(s.aliases ?? []), ...variantForms(s.name)]),
	);
	// The apply path only ever touches the active note, so which list is shown
	// (note-only vs vault-context) changes only *what* gets created/linked.
	// The vault-context list is reconciled + read from the cache on demand.
	const opts = nlpOpts(plugin);
	const secondary = plugin.settings.enableNlpKeywords
		? {
				label: 'Vault context',
				load: async (progress?: ProgressCallback): Promise<Suggestion[]> => {
					await plugin.ensureVaultCache(opts, progress);
					return filterSelfSuggestions(
						plugin.vaultContextSuggestions(source, doc, opts),
						selfName,
					);
				},
			}
		: undefined;
	const apply = async (indices: number[], listIndex = 0) => {
		let active = found;
		if (listIndex === 1 && secondary) {
			await plugin.ensureVaultCache(opts);
			active = filterSelfSuggestions(
				plugin.vaultContextSuggestions(source, doc, opts),
				selfName,
			);
		}
		let created = 0;
		let appended = 0;
		const toLink: ParsedTemplate[] = [];
		const onWrite = plugin.undoableWriter();
		const groups = dedupeSuggestions(
			indices
				.map((i) => active[i])
				.filter((s): s is Suggestion => !!s),
		);
		const dest = await targetFolder(plugin, folder, {});
		const createFolder = scopeFolderFor(effScope, folder) || dest;
		for (const g of groups) {
			if (g.existing) continue;
			try {
				const res = await createNote(
					plugin,
					createFolder,
					{ name: g.name, content: g.content, aliases: g.aliases },
					plugin.settings.capitalize,
					onWrite,
				);
				if (res.created) created++;
				else appended++;
			} catch (err) {
				plugin.notice(`Auto Link Creator error: ${String(err)}`);
			}
		}
		for (const g of groups) {
			if (!g.existing) toLink.push(...g.hits);
		}
		let current = plugin.value();
		if (toLink.length) {
			current = applyLinks(current, toLink, plugin.settings.capitalize);
			plugin.set(current);
		}
		// NLP suggestions carry no positional hits; link their names/aliases
		// wherever they appear as plain text in the source doc.
		const excludeBasename = source.split('/').pop()?.replace(/\.md$/i, '');
		const res = applyExistingLinks(current, groupIndex(groups), {
			capitalize: plugin.settings.capitalize,
			excludeBasename,
			ignoreCodeblocks: plugin.settings.ignoreCodeblocks,
			allowedCodeblocks: plugin.settings.allowedCodeblocks,
			ignoreHtml: plugin.settings.ignoreHtml,
		});
		if (res.updated !== current) plugin.set(res.updated);
		const linked = toLink.length + res.count;
		if (linked) {
			plugin.notice(`Created ${created}, appended ${appended}. Linked ${linked} keyword(s).`);
		} else {
			plugin.notice(`Created ${created}, appended ${appended}.`);
		}
	};
	plugin.preview(dedupeSuggestions(found), apply, secondary);
}

/** Scan every markdown file, preview vault-wide suggestions, apply on select. */
export async function processVaultAndPreview(
	plugin: IPlugin,
	onProgress?: ProgressCallback,
	signal?: AbortSignal,
): Promise<void> {
	const collected = await collectVaultSuggestions(plugin, plugin.settings, onProgress, signal);
	// Cancelled (or nothing found): don't open a preview.
	if (!collected || signal?.aborted) return;
	if (!collected.length) {
		plugin.notice('No keyword matches found in the vault.');
		return;
	}
	plugin.preview(dedupeSuggestions(collected), async (indices) => {
		const onWrite = plugin.undoableWriter();
		let created = 0;
		let appended = 0;
		const promptCache: { value?: string | null } = {};
		const groups = dedupeSuggestions(
			indices
				.map((i) => collected[i])
				.filter((s): s is Suggestion => !!s),
		);
		for (const g of groups) {
			try {
				const dest = await targetFolder(plugin, g.targetFolder ?? '', promptCache);
				const createFolder = scopeFolderFor(plugin.settings, plugin.folder()) || dest;
				const res = await createNote(
					plugin,
					createFolder,
					{ name: g.name, content: g.content, aliases: g.aliases },
					plugin.settings.capitalize,
					onWrite,
				);
				if (res.created) created++;
				else appended++;
			} catch (err) {
				plugin.notice(`Auto Link Creator error: ${String(err)}`);
			}
		}
		let linked = 0;
		if (plugin.settings.enableTemplateKeywords) {
			// Link each file's template hits whose reference matches a selected
			// group (exact or variant), folding them onto the canonical name.
			const targetIdx = groupIndex(groups);
			if (targetIdx.size) {
				for (const file of plugin.markdownFiles()) {
					if (!inScope(file.path, plugin.settings, plugin.folder())) continue;
					const doc = await plugin.read(file.path);
					if (disabledFor(doc)) continue;
					let hits = findAllByTemplates(doc, plugin.settings.templates, scanOpts(plugin));
					if (!hits.length) continue;
					foldHitTargets(hits, targetIdx);
					// Never link a file's own note (Cow.md → [[Cow]]).
					hits = filterSelfHits(hits, basenameOf(file.path));
					if (!hits.length) continue;
					const updated = applyLinks(doc, hits, plugin.settings.capitalize);
					if (updated === doc) continue;
					if (onWrite) await onWrite(file.path, updated);
					else await plugin.write(file.path, updated);
					linked += hits.filter((h) => h.target).length;
				}
			}
		}
		plugin.notice(
			`Created ${created}, appended ${appended}. Linked ${linked} keyword(s).`,
		);
	});
}

/** Link plain-text phrases to existing notes (by name/alias) in the active doc. */
export function linkExistingNotes(plugin: IPlugin): void {
	if (!plugin.settings.enableExistingLinks) {
		plugin.notice('Linking existing notes is disabled in settings.');
		return;
	}
	const source = plugin.source();
	const doc = plugin.value();
	if (disabledFor(doc)) return;
	const excludeBasename = source.split('/').pop()?.replace(/\.md$/i, '');
	const s = plugin.settings;
	const effScope = effectiveScope(s, frontmatterNamespace(doc));
	const entries: IndexEntry[] = plugin.markdownFiles()
		.filter((f) => inScope(f.path, effScope, plugin.folder()))
		.map((f) => ({
			path: f.path,
			basename: f.basename,
			aliases: plugin.noteAliases(f.path),
		}));
	const index = buildNoteIndex(entries, plugin.settings.existingMatchMode, source);
	if (plugin.settings.linkUnresolved) {
		for (const name of plugin.unresolvedLinks()) {
			const forms =
				plugin.settings.existingMatchMode === 'root'
					? variantForms(name.toLowerCase())
					: [name.toLowerCase()];
			for (const key of forms) {
				if (!index.has(key)) index.set(key, name);
			}
		}
	}
	if (!index.size) {
		plugin.notice('No notes found to link.');
		return;
	}
	const res = applyExistingLinks(plugin.value(), index, {
		capitalize: plugin.settings.capitalize,
		excludeBasename,
		ignoreCodeblocks: plugin.settings.ignoreCodeblocks,
		allowedCodeblocks: plugin.settings.allowedCodeblocks,
		ignoreHtml: plugin.settings.ignoreHtml,
	});
	if (!res.count) {
		plugin.notice('No existing-note matches found.');
		return;
	}
	plugin.set(res.updated);
	plugin.notice(`Linked ${res.count} occurrence(s) to existing notes.`);
}

/**
 * Export all discovered keywords (template+NLP suggestions and existing-note
 * names/aliases) as a JSON file so the keyword set survives a vault move.
 */
export async function exportKeywordFile(
	plugin: IPlugin,
	path: string,
	onProgress?: ProgressCallback,
	signal?: AbortSignal,
): Promise<void> {
	const records: KeywordRecord[] = [];
	// Existing-note keywords: every note name + its frontmatter aliases.
	for (const f of plugin.markdownFiles()) {
		const aliases = plugin.noteAliases(f.path);
		if (f.basename || aliases.length) {
			records.push({ name: f.basename, aliases });
		}
	}
	// Template + NLP keywords discovered by a vault scan.
	const collected = await collectVaultSuggestions(plugin, plugin.settings, onProgress, signal);
	if (collected && !signal?.aborted) {
		for (const s of collected) {
			records.push({ name: s.name, aliases: s.aliases ?? [], content: s.content });
		}
	}
	await plugin.write(path, serializeKeywords(records));
	plugin.notice(`Exported ${records.length} keyword record(s) to ${path}.`);
}

/**
 * Import a keyword file: create the target notes (with aliases/content) so
 * plain-text mentions of those keywords link again after a vault move.
 */
export async function importKeywordFile(
	plugin: IPlugin,
	path: string,
): Promise<number> {
	const raw = await plugin.read(path);
	const { records, error } = parseKeywords(raw);
	if (error) {
		plugin.notice(`Auto Link Creator: ${error}`);
		return 0;
	}
	if (!records.length) {
		plugin.notice('No keywords found in file.');
		return 0;
	}
	const onWrite = plugin.undoableWriter();
	let created = 0;
	let appended = 0;
	for (const r of records) {
		try {
			const res = await createNote(
				plugin,
				'',
				{ name: r.name, aliases: r.aliases, content: r.content },
				plugin.settings.capitalize,
				onWrite,
			);
			if (res.created) created++;
			else appended++;
		} catch {
			// Skip keywords that can't be materialized; continue the rest.
		}
	}
	plugin.notice(`Imported ${records.length}: created ${created}, appended ${appended}.`);
	return records.length;
}

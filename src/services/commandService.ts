import { collectSuggestions, dedupeSuggestions } from "../collectSuggestions.ts";
import { collectVaultSuggestions } from "../collectVaultSuggestions.ts";
import { createNote } from "../creator.ts";
import { resolveTargetFolder } from "../folders.ts";
import { applyExistingLinks, buildNoteIndex, foldHitTargets } from "../existingLinks.ts";
import type { IndexEntry } from "../existingLinks.ts";
import { applyLinks } from "../link.ts";
import { variantForms } from "../nlp.ts";
import { nlpSuggestions } from "../nlpSuggestions.ts";
import { findAllByTemplates } from "../template.ts";
import type { ParsedTemplate } from "../template.ts";
import { filterByPreviewMode } from "../ui/suggestion.ts";
import type { Suggestion } from "../ui/suggestion.ts";
import type { IPlugin } from "./ipluginInterface.ts";

/** Note index over the vault's markdown files, per the existing-match mode. */
function vaultNoteIndex(plugin: IPlugin): Map<string, string> {
	const entries: IndexEntry[] = plugin.markdownFiles().map((f) => ({
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
	};
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
	const hits = findAllByTemplates(doc, plugin.settings.templates, scanOpts(plugin));
	if (!hits.length) {
		if (!quiet) plugin.notice('No template matches found.');
		return;
	}
	// Fold variant references onto existing notes (Armor Classes → Armor Class).
	foldHitTargets(hits, vaultNoteIndex(plugin));
	plugin.set(applyLinks(doc, hits, plugin.settings.capitalize));
	plugin.notice(`Linked ${hits.length} keyword(s).`);
}

/** Preview suggestions for the active file; applying creates notes + links. */
export function processFileAndPreview(plugin: IPlugin): void {
	const doc = plugin.value();
	const folder = plugin.folder();
	const source = plugin.source();
	const found: Suggestion[] = [];
	if (plugin.settings.enableTemplateKeywords) {
		found.push(
			...collectSuggestions(
				findAllByTemplates(doc, plugin.settings.templates, scanOpts(plugin)),
				source || undefined,
			),
		);
	}
	if (plugin.settings.enableNlpKeywords) {
		const extra = plugin.settings.extraStopwords.split(',').map((s) => s.trim()).filter(Boolean);
		const nlpFound = nlpSuggestions(doc, extra);
		if (source) for (const s of nlpFound) s.sources = [source];
		found.push(...nlpFound);
	}
	const suggestions = filterByPreviewMode(found, plugin.settings.previewKeywords);
	if (!suggestions.length) {
		plugin.notice('No keyword matches found.');
		return;
	}
	plugin.preview(suggestions, async (indices) => {
		let created = 0;
		let appended = 0;
		const toLink: ParsedTemplate[] = [];
		const onWrite = plugin.undoableWriter();
		const groups = dedupeSuggestions(
			indices
				.map((i) => suggestions[i])
				.filter((s): s is Suggestion => !!s),
		);
		const dest = await targetFolder(plugin, folder, {});
		for (const g of groups) {
			try {
				const res = await createNote(
					plugin,
					dest,
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
		for (const g of groups) toLink.push(...g.hits);
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
		});
		if (res.updated !== current) plugin.set(res.updated);
		const linked = toLink.length + res.count;
		if (linked) {
			plugin.notice(`Created ${created}, appended ${appended}. Linked ${linked} keyword(s).`);
		} else {
			plugin.notice(`Created ${created}, appended ${appended}.`);
		}
	});
}

/** Scan every markdown file, preview vault-wide suggestions, apply on select. */
export async function processVaultAndPreview(plugin: IPlugin): Promise<void> {
	const collected = await collectVaultSuggestions(plugin, plugin.settings);
	const suggestions = filterByPreviewMode(collected, plugin.settings.previewKeywords);
	if (!suggestions.length) {
		plugin.notice('No keyword matches found in the vault.');
		return;
	}
	plugin.preview(suggestions, async (indices) => {
		const onWrite = plugin.undoableWriter();
		let created = 0;
		let appended = 0;
		const promptCache: { value?: string | null } = {};
		const groups = dedupeSuggestions(
			indices
				.map((i) => suggestions[i])
				.filter((s): s is Suggestion => !!s),
		);
		for (const g of groups) {
			try {
				const res = await createNote(
					plugin,
					await targetFolder(plugin, g.targetFolder ?? '', promptCache),
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
					const doc = await plugin.read(file.path);
					const hits = findAllByTemplates(doc, plugin.settings.templates, scanOpts(plugin));
					if (!hits.length) continue;
					foldHitTargets(hits, targetIdx);
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
	const excludeBasename = source.split('/').pop()?.replace(/\.md$/i, '');
	const entries: IndexEntry[] = plugin.markdownFiles().map((f) => ({
		path: f.path,
		basename: f.basename,
		aliases: plugin.noteAliases(f.path),
	}));
	const index = buildNoteIndex(entries, plugin.settings.existingMatchMode);
	if (!index.size) {
		plugin.notice('No notes found to link.');
		return;
	}
	const res = applyExistingLinks(plugin.value(), index, {
		capitalize: plugin.settings.capitalize,
		excludeBasename,
	});
	if (!res.count) {
		plugin.notice('No existing-note matches found.');
		return;
	}
	plugin.set(res.updated);
	plugin.notice(`Linked ${res.count} occurrence(s) to existing notes.`);
}

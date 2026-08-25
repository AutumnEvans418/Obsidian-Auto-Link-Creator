import { collectSuggestions, dedupeSuggestions } from "../collectSuggestions.ts";
import { collectVaultSuggestions } from "../collectVaultSuggestions.ts";
import { createNote } from "../creator.ts";
import { applyExistingLinks, buildNoteIndex, foldHitTargets } from "../existingLinks.ts";
import type { IndexEntry } from "../existingLinks.ts";
import { applyLinks } from "../link.ts";
import { variantForms } from "../nlp.ts";
import { nlpSuggestions } from "../nlpSuggestions.ts";
import { findAllByTemplates } from "../template.ts";
import type { ParsedTemplate } from "../template.ts";
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

/** Rewrite template keyword lines in `plugin`'s doc into wiki links, idempotently. */
export function linkTemplateKeywords(plugin: IPlugin, quiet = false): void {
	const doc = plugin.value();
	const hits = findAllByTemplates(doc, plugin.settings.templates, {
		ignoreCodeblocks: plugin.settings.ignoreCodeblocks,
	});
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
	const suggestions: Suggestion[] = [];
	if (plugin.settings.enableTemplateKeywords) {
		suggestions.push(
			...collectSuggestions(
				findAllByTemplates(doc, plugin.settings.templates, {
					ignoreCodeblocks: plugin.settings.ignoreCodeblocks,
				}),
				source || undefined,
			),
		);
	}
	if (plugin.settings.enableNlpKeywords) {
		const extra = plugin.settings.extraStopwords.split(',').map((s) => s.trim()).filter(Boolean);
		const found = nlpSuggestions(doc, extra);
		if (source) for (const s of found) s.sources = [source];
		suggestions.push(...found);
	}
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
		for (const g of groups) {
			try {
				const res = await createNote(
					plugin,
					folder,
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
		if (toLink.length) {
			plugin.set(applyLinks(plugin.value(), toLink, plugin.settings.capitalize));
			plugin.notice(
				`Created ${created}, appended ${appended}. Linked ${toLink.length} keyword(s).`,
			);
		} else {
			plugin.notice(`Created ${created}, appended ${appended}.`);
		}
	});
}

/** Scan every markdown file, preview vault-wide suggestions, apply on select. */
export async function processVaultAndPreview(plugin: IPlugin): Promise<void> {
	const suggestions = await collectVaultSuggestions(plugin, plugin.settings);
	if (!suggestions.length) {
		plugin.notice('No keyword matches found in the vault.');
		return;
	}
	plugin.preview(suggestions, async (indices) => {
		const onWrite = plugin.undoableWriter();
		let created = 0;
		let appended = 0;
		const groups = dedupeSuggestions(
			indices
				.map((i) => suggestions[i])
				.filter((s): s is Suggestion => !!s),
		);
		for (const g of groups) {
			try {
				const res = await createNote(
					plugin,
					g.targetFolder ?? '',
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
			const targetIdx = new Map<string, string>();
			for (const g of groups) {
				for (const form of variantForms(g.name.toLowerCase())) {
					if (!targetIdx.has(form)) targetIdx.set(form, g.name);
				}
			}
			if (targetIdx.size) {
				for (const file of plugin.markdownFiles()) {
					const doc = await plugin.read(file.path);
					const hits = findAllByTemplates(
						doc,
						plugin.settings.templates,
						{ ignoreCodeblocks: plugin.settings.ignoreCodeblocks },
					);
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

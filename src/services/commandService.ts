import { collectSuggestions } from "../collectSuggestions";
import { createNote } from "../creator";
import { applyLinks } from "../link";
import { makeUndoableWrite } from "../makeUndoableWrite";
import { nlpSuggestions } from "../nlpSuggestions";
import { PreviewSuggestModal } from "../PreviewSuggestModal";
import type { AutoLinkSettings } from "../settings";
import { findAllByTemplates, type ParsedTemplate } from "../template";
import type { Suggestion } from "../ui/suggestion";
import type { IPlugin } from "./ipluginInterface";

export function onSave() {

}

/** Rewrite template keyword lines in `editor` into wiki links, idempotently. */
export function linkTemplateKeywords(plugin: IPlugin, quiet = false): void {
    const doc = plugin.value();
    const hits = findAllByTemplates(doc, plugin.settings.templates, {
        ignoreCodeblocks: plugin.settings.ignoreCodeblocks,
    });
    if (!hits.length) {
        if (!quiet) plugin.notice('No template matches found.');
        return;
    }
    plugin.set(applyLinks(doc, hits, plugin.settings.capitalize));
    plugin.notice(`Linked ${hits.length} keyword(s).`);
}

export function processFileAndPreview(plugin: IPlugin) {
    const doc = plugin.value();
    const folder = plugin.folder();
    const suggestions: Suggestion[] = [];
    if (plugin.settings.enableTemplateKeywords) {
        suggestions.push(
            ...collectSuggestions(
                findAllByTemplates(doc, plugin.settings.templates, {
                    ignoreCodeblocks: plugin.settings.ignoreCodeblocks,
                }),
            ),
        );
    }
    if (plugin.settings.enableNlpKeywords) {
        const extra = plugin.settings.extraStopwords.split(',').map((s) => s.trim()).filter(Boolean);
        suggestions.push(...nlpSuggestions(doc, extra));
    }
    if (!suggestions.length) {
        plugin.notice('No keyword matches found.');
        return;
    }
    const modal = new PreviewSuggestModal(this.app, suggestions, async (indices) => {
        let created = 0;
        let appended = 0;
        const toLink: ParsedTemplate[] = [];
        const onWrite = plugin.settings.openForUndo
            ? makeUndoableWrite(this.app)
            : undefined;
        for (const i of indices) {
            const s = suggestions[i];
            if (!s) continue;
            for (const h of s.hits) toLink.push(h);
            try {
                const res = await createNote(
                    plugin,
                    folder,
                    { name: s.name, content: s.content, aliases: s.aliases },
                    plugin.settings.capitalize,
                    onWrite,
                );
                if (res.created) created++;
                else appended++;
            } catch (err) {
                plugin.notice(`Auto Link Creator error: ${String(err)}`);
            }
        }
        if (toLink.length) {
            plugin.set(applyLinks(plugin.value(), toLink, plugin.settings.capitalize));
            plugin.notice(
                `Created ${created}, appended ${appended}. Linked ${toLink.length} keyword(s).`,
            );
        } else {
            plugin.notice(`Created ${created}, appended ${appended}.`);
        }
    });
    modal.open();
}
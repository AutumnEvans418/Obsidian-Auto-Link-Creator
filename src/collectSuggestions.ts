import { type ParsedTemplate, groupByReference, groupContent } from './template.ts';
import { sameReference, variantForms } from './nlp.ts';
import type { Suggestion } from './ui/suggestion.ts';

/**
 * Group template hits into suggestions. When `file` is given, each hit is
 * sourced as `file:line` (1-based) for preview provenance.
 */
export function collectSuggestions(hits: ParsedTemplate[], file?: string): Suggestion[] {
	return groupByReference(hits).map((group) => {
		const lead = group[0];
		const rest = group.slice(1);
		// Variant forms (plural/singular/root) so created notes carry aliases
		// even when the suggestion came from template hits alone.
		const leadName = lead?.name ?? '';
		const aliases = [...new Set([...rest.map((h) => h.name), ...variantForms(leadName)])]
			.filter((n) => n && n.toLowerCase() !== leadName.toLowerCase());
		// Fold variant hits onto the lead name so applyLinks emits
		// [[Lead|Variant]] instead of a self-link to the variant.
		for (const h of rest) {
			if (lead && !h.target) h.target = lead.name;
		}
		const templates: string[] = [];
		for (const h of group) {
			if (h.template && !templates.includes(h.template)) templates.push(h.template);
		}
		return {
			name: lead?.name ?? '',
			aliases,
			content: groupContent(group),
			count: group.length,
			hits: group,
			sources: file
				? group.map((h) => `${file}:${h.lineIndex + 1}`)
				: undefined,
			templates: templates.length ? templates : undefined,
		};
	});
}

/** Merge same-reference suggestions so one run never creates duplicate notes. */
export function dedupeSuggestions(selected: Suggestion[]): Suggestion[] {
	const out: Suggestion[] = [];
	for (const s of selected) {
		const canon = out.find((o) => sameReference(o.name, s.name));
		if (!canon) {
			out.push(s);
			continue;
		}
		if (s.existing) canon.existing = true;
		for (const a of [s.name, ...s.aliases]) {
			if (a !== canon.name && !canon.aliases.includes(a)) canon.aliases.push(a);
		}
		if (s.content && !canon.content?.includes(s.content))
			canon.content = canon.content ? `${canon.content}\n${s.content}` : s.content;
		canon.hits.push(...s.hits);
		canon.count = (canon.count ?? 0) + (s.count ?? 0);
		for (const src of s.sources ?? []) {
			if (!canon.sources?.includes(src)) (canon.sources ??= []).push(src);
		}
	}
	return out;
}

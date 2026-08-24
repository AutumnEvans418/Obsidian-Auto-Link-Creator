import { type ParsedTemplate, groupByReference, groupContent } from './template.ts';
import type { Suggestion } from './ui/suggestion.ts';

/**
 * Group template hits into suggestions. When `file` is given, each hit is
 * sourced as `file:line` (1-based) for preview provenance.
 */
export function collectSuggestions(hits: ParsedTemplate[], file?: string): Suggestion[] {
	return groupByReference(hits).map((group) => {
		const lead = group[0];
		const rest = group.slice(1);
		const aliases = rest.map((h) => h.name).filter((n) => n !== lead?.name);
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

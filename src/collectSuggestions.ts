import { type ParsedTemplate, groupByReference, groupContent } from './template.ts';
import type { Suggestion } from './ui/suggestion.ts';

export function collectSuggestions(hits: ParsedTemplate[]): Suggestion[] {
	return groupByReference(hits).map((group) => {
		const lead = group[0];
		const rest = group.slice(1);
		const aliases = rest.map((h) => h.name).filter((n) => n !== lead?.name);
		return {
			name: lead?.name ?? '',
			aliases,
			content: groupContent(group),
			count: group.length,
			hits: group,
		};
	});
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSuggestions, dedupeSuggestions } from '../src/collectSuggestions.ts';
import type { ParsedTemplate } from '../src/template.ts';
import type { Suggestion } from '../src/ui/suggestion.ts';

const hit = (name: string, lineIndex = 0): ParsedTemplate => ({
	name,
	alias: undefined,
	content: undefined,
	lineIndex,
	template: '',
});

test('collectSuggestions folds variant hits onto the lead name', () => {
	const out = collectSuggestions([hit('Armor Class', 0), hit('Armor Classes', 1)]);
	assert.equal(out.length, 1);
	assert.equal(out[0]?.name, 'Armor Class');
	assert.ok(out[0]?.aliases.includes('Armor Classes'));
	assert.equal(out[0]?.hits[1]?.target, 'Armor Class');
});

test('collectSuggestions adds variant-form aliases to template-only suggestions', () => {
	const out = collectSuggestions([hit('Service Level Agreement')]);
	assert.equal(out.length, 1);
	assert.ok(out[0]?.aliases.includes('service level agreements'));
});

test('dedupeSuggestions merges same-reference suggestions', () => {
	const a: Suggestion = {
		name: 'Risk Appetite',
		aliases: [],
		content: 'level of risk',
		hits: [hit('Risk Appetite')],
	};
	const b: Suggestion = {
		name: 'Risk Appetites',
		aliases: [],
		content: 'level of risk accepted',
		hits: [hit('Risk Appetites')],
	};
	const out = dedupeSuggestions([a, b]);
	assert.equal(out.length, 1);
	assert.equal(out[0]?.name, 'Risk Appetite');
	assert.ok(out[0]?.aliases.includes('Risk Appetites'));
	assert.ok(out[0]?.content?.includes('level of risk accepted'));
	assert.equal(out[0]?.hits.length, 2);
});

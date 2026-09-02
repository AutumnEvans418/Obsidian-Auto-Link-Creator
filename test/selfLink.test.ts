import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basenameOf, filterSelfHits, filterSelfSuggestions, isSelfSuggestion } from '../src/selfLink.ts';
import type { Suggestion } from '../src/ui/suggestion.ts';
import type { ParsedTemplate } from '../src/template.ts';

test('basenameOf strips path and .md extension', () => {
	assert.equal(basenameOf('notes/Cow.md'), 'Cow');
	assert.equal(basenameOf('Cow.md'), 'Cow');
	assert.equal(basenameOf('a/b/c.md'), 'c');
});

test('isSelfSuggestion matches exact and variant forms of the current note', () => {
	const base = (name: string, target?: string): Suggestion =>
		({ name, aliases: [], hits: [], target: target as never } as Suggestion);
	assert.ok(isSelfSuggestion(base('Cow'), 'Cow'));
	assert.ok(isSelfSuggestion(base('cows'), 'Cow'), 'plural form is a self-link');
	assert.ok(isSelfSuggestion(base('Cow'), 'cow'), 'case-insensitive');
	assert.ok(!isSelfSuggestion(base('Cow'), 'Bovine'));
	assert.ok(!isSelfSuggestion(base('Cow'), ''));
});

test('filterSelfSuggestions drops only the current note', () => {
	const list = [
		{ name: 'Cow', aliases: [], hits: [] },
		{ name: 'Bovine', aliases: [], hits: [] },
	] as Suggestion[];
	const kept = filterSelfSuggestions(list, 'Cow');
	assert.deepEqual(kept.map((s) => s.name), ['Bovine']);
});

test('filterSelfHits keeps resolved (unfolded) references to other notes', () => {
	const hit = (name: string, target?: string): ParsedTemplate =>
		({ name, lineIndex: 0, target }) as ParsedTemplate;
	// Self-reference stays unfolded (target undefined) but name is the note → dropped.
	assert.deepEqual(filterSelfHits([hit('Cow'), hit('Cows')], 'Cow'), []);
	// Folded onto the current note from a variant → dropped.
	assert.deepEqual(filterSelfHits([hit('Cows', 'Cow')], 'Cow'), []);
	// Folded onto a different note → kept.
	assert.deepEqual(filterSelfHits([hit('Cows', 'Bovine')], 'Cow').map((h) => h.name), ['Cows']);
	// Empty basename (no source) → keep everything.
	assert.equal(filterSelfHits([hit('Cow')], '').length, 1);
});

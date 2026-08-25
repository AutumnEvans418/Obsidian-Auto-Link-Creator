import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByPreviewMode, suggestionKinds } from '../src/ui/suggestion.ts';
import type { Suggestion } from '../src/ui/suggestion.ts';

const templateOnly: Suggestion = { name: 'Cow', aliases: [], hits: [], templates: ['- {{Link Name}} - {{Link Content}}'] };
const nlpOnly: Suggestion = { name: 'cows', aliases: [], hits: [], nlpRoot: 'cow' };
const both: Suggestion = {
	name: 'Cow',
	aliases: [],
	hits: [],
	templates: ['- {{Link Name}}'],
	nlpRoot: 'cow',
};

test('suggestionKinds classifies by provenance fields', () => {
	assert.deepEqual(suggestionKinds(templateOnly), ['template']);
	assert.deepEqual(suggestionKinds(nlpOnly), ['nlp']);
	assert.deepEqual(suggestionKinds(both), ['template', 'nlp']);
	assert.deepEqual(suggestionKinds({ name: 'x', aliases: [], hits: [] }), []);
});

test('filterByPreviewMode keeps both by default', () => {
	const all = [templateOnly, nlpOnly, both];
	assert.equal(filterByPreviewMode(all, 'both'), all);
});

test('filterByPreviewMode filters template or nlp only', () => {
	const all = [templateOnly, nlpOnly, both];
	assert.deepEqual(filterByPreviewMode(all, 'template'), [templateOnly, both]);
	assert.deepEqual(filterByPreviewMode(all, 'nlp'), [nlpOnly, both]);
});

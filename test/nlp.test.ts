import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rootForm, singularize, pluralize } from '../src/nlp.ts';

test('library loads and parses text', () => {
	assert.equal(rootForm('changes'), 'change');
});

test('root/lemma of irregular verbs', () => {
	assert.equal(rootForm('changed'), 'change');
	assert.equal(rootForm('walked'), 'walk');
	assert.equal(rootForm('went'), 'go');
});

test('singularize', () => {
	assert.equal(singularize('cows'), 'cow');
	assert.equal(singularize('parties'), 'party');
});

test('pluralize', () => {
	assert.equal(pluralize('cow'), 'cows');
	assert.equal(pluralize('party'), 'parties');
});

test('irregular plurals', () => {
	assert.equal(singularize('children'), 'child');
	assert.equal(pluralize('ox'), 'oxen');
});

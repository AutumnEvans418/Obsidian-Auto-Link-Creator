import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nlpSuggestions } from '../src/nlpSuggestions.ts';

test('nlpSuggestions groups variants and needs minFreq=2 in the doc', () => {
	const s = nlpSuggestions('The cows grazed. The cows slept.');
	assert.equal(s.length, 1);
	assert.equal(s[0]?.name, 'Cows');
	assert.equal(s[0]?.nlpRoot, 'cow');
	assert.ok((s[0]?.aliases ?? []).includes('cow'));
});

test('nlpSuggestions drops a phrase repeated only once locally', () => {
	const s = nlpSuggestions('Cow grazes here.');
	assert.equal(s.length, 0);
});

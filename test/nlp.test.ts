import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rootForm, singularize, pluralize, titleCase, sameReference } from '../src/nlp.ts';

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

test('titleCase capitalizes each word', () => {
	assert.equal(titleCase('access control systems'), 'Access Control Systems');
	assert.equal(titleCase('test3'), 'Test3');
	assert.equal(titleCase('space  trip'), 'Space  Trip');
});

test('sameReference collapses singular/plural forms', () => {
	assert.equal(sameReference('Risk Appetite', 'Risk Appetites'), true);
	assert.equal(sameReference('Access Control Systems', 'Access Control System'), true);
	assert.equal(sameReference('Risk Appetite', 'Access Control Systems'), false);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { minimalChanges } from '../src/textDiff.ts';

test('no-op returns no changes', () => {
	assert.deepEqual(minimalChanges('a\nb\nc', 'a\nb\nc'), []);
	assert.deepEqual(minimalChanges('', ''), []);
});

test('single-line link insertion emits one bounded change', () => {
	const old = ['- Risk Appetite - Risk', '- plain line', '- bottom'].join('\n');
	const fresh = ['- [[Risk Appetite]] - Risk', '- plain line', '- bottom'].join('\n');
	assert.deepEqual(minimalChanges(old, fresh), [
		{
			from: { line: 0, ch: 0 },
			to: { line: 0, ch: '- Risk Appetite - Risk'.length },
			text: '- [[Risk Appetite]] - Risk',
		},
	]);
});

test('two disjoint changed lines yield two bounded changes', () => {
	const old = ['a', 'Cow eat grass', 'c', 'Cows graze', 'e'].join('\n');
	const fresh = ['a', '[[Cow]] eat grass', 'c', '[[Cow]]s graze', 'e'].join('\n');
	assert.deepEqual(minimalChanges(old, fresh), [
		{
			from: { line: 1, ch: 0 },
			to: { line: 1, ch: 'Cow eat grass'.length },
			text: '[[Cow]] eat grass',
		},
		{
			from: { line: 3, ch: 0 },
			to: { line: 3, ch: 'Cows graze'.length },
			text: '[[Cow]]s graze',
		},
	]);
});

test('adjacent changed lines merge into one change', () => {
	const old = ['x', 'Cow', 'Cows', 'y'].join('\n');
	const fresh = ['x', '[[Cow]]', '[[Cow]]s', 'y'].join('\n');
	assert.deepEqual(minimalChanges(old, fresh), [
		{
			from: { line: 1, ch: 0 },
			to: { line: 2, ch: 4 },
			text: '[[Cow]]\n[[Cow]]s',
		},
	]);
});

test('preserves a final newline when the last line changes', () => {
	const old = 'Cow\n';
	const fresh = '[[Cow]]\n';
	assert.deepEqual(minimalChanges(old, fresh), [
		{
			from: { line: 0, ch: 0 },
			to: { line: 0, ch: 3 },
			text: '[[Cow]]',
		},
	]);
});
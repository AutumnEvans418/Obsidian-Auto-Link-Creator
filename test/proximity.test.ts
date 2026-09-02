import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrenceLines, proximityScore, rankByProximity } from '../src/proximity.ts';

test('occurrenceLines finds forms across lines (case-insensitive)', () => {
	const doc = 'Cow grazes.\nSomething else.\nThe cows graze here.\nCow again.';
	assert.deepEqual(occurrenceLines(doc, ['Cow', 'Cows']), [0, 2, 3]);
});

test('occurrenceLines is empty when absent', () => {
	assert.deepEqual(occurrenceLines('nothing here', ['Cow']), []);
});

test('proximityScore: single occurrence has no cluster signal', () => {
	assert.equal(proximityScore([]), 0);
	assert.equal(proximityScore([2]), 0);
});

test('proximityScore: clustered occurrences outrank scattered ones', () => {
	const clustered = proximityScore([0, 1, 2]); // 3 / (2-0+1) = 1
	const scattered = proximityScore([0, 40, 80]); // 3 / (80-0+1) = 0.037
	assert.ok(clustered > scattered, 'clustered should score higher');
	assert.equal(clustered, 1);
});

test('proximityScore: same-line occurrences score the full count', () => {
	assert.equal(proximityScore([3, 3, 3]), 3);
	assert.equal(proximityScore([5, 5]), 2);
});

test('rankByProximity orders clustered phrases first, count as tiebreak', () => {
	const items = [
		{ name: 'scattered', count: 3 },
		{ name: 'clustered', count: 2 },
	];
	const lines = (it: { name: string }) =>
		it.name === 'clustered' ? [0, 1, 2] : [0, 50, 100];
	const ranked = rankByProximity(items, lines);
	assert.deepEqual(ranked.map((r) => r.name), ['clustered', 'scattered']);
});

test('rankByProximity is ranking only (never filters, stable on ties)', () => {
	const items = [{ name: 'a', count: 1 }, { name: 'b', count: 1 }];
	const ranked = rankByProximity(items, () => [1, 2]);
	assert.equal(ranked.length, 2);
	assert.deepEqual(ranked.map((r) => r.name), ['a', 'b'], 'ties keep original order');
});

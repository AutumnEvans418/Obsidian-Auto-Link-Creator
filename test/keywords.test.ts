import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeywords, extractKeywordsFromDocs } from '../src/keywords.ts';

test('groups plural/singular forms into one reference', () => {
	const out = extractKeywords('A cow and many cows. Another cow nearby.');
	// "cow" appears 3x, "cows" 1x → grouped under "cow" (root), name = most frequent spelling.
	const cow = out.find((k) => k.name.toLowerCase() === 'cow');
	assert.ok(cow, `expected cow in ${out.map((k) => k.name).join(', ')}`);
	assert.equal(cow!.count, 3);
	assert.ok(cow!.aliases.includes('cows'));
});

test('groups party/parties', () => {
	const out = extractKeywords('The party started. Two parties met. A third party joined.');
	assert.ok(out.some((k) => k.name.toLowerCase() === 'party'));
});

test('aliases include forms absent from the text', () => {
	const out = extractKeywords('the party was fun; the same party again');
	const party = out.find((k) => k.name.toLowerCase() === 'party');
	assert.ok(party);
	assert.ok(party!.aliases.includes('parties'), 'plural alias present even though never written');
});

test('drops stop-words and short words', () => {
	const out = extractKeywords('the and or to a an the and or');
	assert.equal(out.length, 0);
});

test('extra stop words are honoured', () => {
	const out = extractKeywords('gadget widget window widget window', { extraStopwords: ['gadget', ' widget '] });
	assert.equal(out.length, 1);
	assert.equal(out[0]!.name.toLowerCase(), 'window');
});

test('repeated two-word phrase surfaces', () => {
	const out = extractKeywords('access control is key. access control matters. access control audit.');
	const ac = out.find((k) => k.name.toLowerCase() === 'access control');
	assert.ok(ac, out.map((k) => k.name).join(', '));
	assert.ok((ac!.count ?? 0) >= 3);
});

test('respects minFreq and maxNgram', () => {
	const text = 'x y z x y z x y z';
	assert.ok(extractKeywords(text, { minFreq: 10 }).length === 0);
	// single-word pass only → no bigram "x y"
	const singles = extractKeywords(text, { maxNgram: 1 });
	assert.ok(singles.every((k) => !k.name.includes(' ')));
});

test('returns higher frequency first', () => {
	const out = extractKeywords('apple pear pear pear apple pear', { maxNgram: 1 });
	assert.equal(out[0]!.name.toLowerCase(), 'pear');
});

test('accumulates frequency across documents (vault-wide)', () => {
	// Each file alone only mentions "gadget" once → per-file minFreq would drop it.
	const docs = [
		'gadget here',
		'gadget there',
		'the gadget is great',
		'parse the gadget shape',
	];
	const out = extractKeywordsFromDocs(docs, { maxNgram: 1 });
	const gadget = out.find((k) => k.name.toLowerCase() === 'gadget');
	assert.ok(gadget, `gadget missing from ${out.map((k) => k.name).join(', ')}`);
	assert.equal(gadget!.count, 4);
});

test('per-file scan still applies minFreq within each document', () => {
	const out = extractKeywordsFromDocs(['gadget here', 'other stuff'], { minFreq: 3 });
	assert.ok(!out.some((k) => k.name.toLowerCase() === 'gadget'));
});

test('frontmatter prose is not counted as keywords', () => {
	const doc = [
		'---',
		'tags: [gadget, widget]',
		'description: gadget gadget widget',
		'---',
		'widget here and widget there',
	].join('\n');
	const out = extractKeywords(doc);
	assert.ok(!out.some((k) => k.name.toLowerCase() === 'gadget'));
	assert.ok(out.some((k) => k.name.toLowerCase() === 'widget'), 'body words still count');
});

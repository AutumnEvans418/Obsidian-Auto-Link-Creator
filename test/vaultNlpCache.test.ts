import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	applyDocChange,
	deserializeVaultCache,
	makeVaultCache,
	pruneVaultCache,
	serializeVaultCache,
	vaultKeywordHits,
	vaultSuggestions,
} from '../src/vaultNlpCache.ts';

test('applyDocChange recounts on mtime change and skips when mtime+optsKey match', () => {
	const cache = makeVaultCache();
	assert.equal(applyDocChange(cache, 'a.md', 1, 'Cow cow cow'), true);
	assert.equal(cache.get('a.md')?.ngrams.get('cow')?.count, 3);

	// Same mtime + same options: no-op.
	assert.equal(applyDocChange(cache, 'a.md', 1, 'Totally different text'), false);
	assert.equal(cache.get('a.md')?.ngrams.get('cow')?.count, 3, 'not recounted on same mtime');

	// New mtime: recount.
	assert.equal(applyDocChange(cache, 'a.md', 2, 'Cow cow cow cow'), true);
	assert.equal(cache.get('a.md')?.ngrams.get('cow')?.count, 4);
});

test('applyDocChange skips when optsKey changes even under same mtime', () => {
	const cache = makeVaultCache();
	applyDocChange(cache, 'a.md', 5, 'Cow cow cow', { minWordLen: 3 });
	// Different stopwords -> different optsKey -> recount under same mtime.
	applyDocChange(cache, 'a.md', 5, 'Party party', { minWordLen: 3, extraStopwords: ['cow'] });
	assert.ok(cache.get('a.md')?.ngrams.has('party'), 'recounted when optsKey changed');
});

test('pruneVaultCache drops paths absent from the vault', () => {
	const cache = makeVaultCache();
	applyDocChange(cache, 'a.md', 1, 'Cow cow');
	applyDocChange(cache, 'b.md', 1, 'Party party');
	pruneVaultCache(cache, new Set(['a.md']));
	assert.ok(cache.has('a.md'));
	assert.ok(!cache.has('b.md'), 'deleted path pruned');
});

test('serializeVaultCache/deserializeVaultCache round-trips counts and forms', () => {
	const cache = makeVaultCache();
	applyDocChange(cache, 'a.md', 7, 'The cows grazed. The cows slept.');
	const plain = serializeVaultCache(cache);
	const restored = deserializeVaultCache(plain);
	const entry = restored.get('a.md');
	assert.equal(entry?.mtime, 7);
	assert.equal(entry?.ngrams.get('cow')?.count, 2);
	assert.deepEqual(deserializeVaultCache(undefined), makeVaultCache(), 'undefined -> empty');
});

test('vaultSuggestions aggregates other-file counts, excludes currentSource, keeps live currentDoc', () => {
	const cache = makeVaultCache();
	applyDocChange(cache, 'other.md', 1, 'Cryptography is essential. More cryptography.');
	applyDocChange(cache, 'source.md', 1, 'Cryptography dominates here.');
	const s = vaultSuggestions(cache, 'source.md', 'Cryptography matters.');
	const crypt = s.find((x) => x.name.toLowerCase() === 'cryptography');
	assert.ok(crypt, 'phrase present in current note surfaces');
	assert.equal(crypt?.count, 3, 'count = currentDoc(1) + other.md(2) but excludes currentSource file');
});

test('vaultSuggestions filters phrases absent from the current note', () => {
	const cache = makeVaultCache();
	applyDocChange(cache, 'other.md', 1, 'Cow cow cow');
	const s = vaultSuggestions(cache, 'source.md', 'Party here.');
	for (const x of s) {
		assert.ok('party here.'.includes(x.name.toLowerCase()), `${x.name} missing from current note`);
	}
});

test('vaultKeywordHits aggregates cached counts and tracks per-file membership', () => {
	const cache = makeVaultCache();
	applyDocChange(cache, 'a/one.md', 1, 'Cow appears once.');
	applyDocChange(cache, 'a/two.md', 1, 'Cow again, cow thrice.');
	const hits = vaultKeywordHits(cache, 2);
	const cow = hits.find((h) => h.name.toLowerCase() === 'cow');
	assert.ok(cow, 'cow passes aggregate minFreq');
	assert.equal(cow?.count, 3, 'count summed across files');
	assert.deepEqual(cow?.files, new Set(['a/one.md', 'a/two.md']), 'membership from both files');
	assert.ok(!hits.find((h) => h.name.toLowerCase() === 'appears'), 'sub-threshold phrase dropped');
});

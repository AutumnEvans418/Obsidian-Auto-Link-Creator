import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	isValidTemplate,
	makeIgnored,
	DEFAULT_IGNORES,
	frontmatterEnd,
	frontmatterDisabled,
	makeCodeblockFilter,
} from '../src/validation.ts';

test('accepts a template with {{Link Name}}', () => {
	assert.equal(isValidTemplate('- {{Link Name}} ({{Link Alias}}) - {{Link Content}}'), true);
});

test('accepts template with case-insensitive field', () => {
	assert.equal(isValidTemplate('{{link name}}'), true);
});

test('rejects template missing the Link Name field', () => {
	assert.equal(isValidTemplate('- text - {{Link Content}}'), false);
});

test('rejects template with no fields', () => {
	assert.equal(isValidTemplate('- just some text'), false);
});

test('rejects empty template', () => {
	assert.equal(isValidTemplate(''), false);
});

test('makeIgnored rejects default numbers/dates, keeps words', () => {
	const ignored = makeIgnored(DEFAULT_IGNORES);
	assert.equal(ignored('6'), true);
	assert.equal(ignored('2026'), true);
	assert.equal(ignored('2026-08-24'), true);
	assert.equal(ignored('2026-08-24T23:47:33-05:00'), true);
	assert.equal(ignored('Armor Class'), false);
	assert.equal(ignored('--'), false);
	assert.equal(ignored('v2'), false);
});

test('makeIgnored matches the whole name; invalid regex is skipped', () => {
	const ignored = makeIgnored([
		{ label: 'numbers', regex: '^\\d+$' },
		{ label: 'broken', regex: '(' },
		{ label: 'exact', regex: 'v2' },
	]);
	assert.equal(ignored('6'), true);
	assert.equal(ignored('v2'), true);
	assert.equal(ignored('v20'), false);
	assert.doesNotThrow(() => ignored('anything'));
});

test('frontmatterEnd finds the closing fence, or -1', () => {
	assert.equal(frontmatterEnd(['---', 'a: 1', '---', 'body']), 2);
	assert.equal(frontmatterEnd(['no frontmatter', '---']), -1);
	assert.equal(frontmatterEnd([]), -1);
});

test('frontmatterDisabled flags a falsy auto-link property', () => {
	assert.equal(frontmatterDisabled('---\nauto-link: false\n---\nbody'), true);
	assert.equal(frontmatterDisabled('---\nauto-link: no\n---\nbody'), true);
	assert.equal(frontmatterDisabled('---\nauto-link: true\n---\nbody'), false);
	assert.equal(frontmatterDisabled('---\ntitle: x\n---\nbody'), false);
	assert.equal(frontmatterDisabled('no frontmatter at all'), false);
});

test('codeblock filter skips html lines only when ignoreHtml is on', () => {
	const html = '   <div class="x">cow</div>';
	assert.equal(makeCodeblockFilter({})(html), false);
	assert.equal(makeCodeblockFilter({ ignoreHtml: true })(html), true);
	assert.equal(makeCodeblockFilter({ ignoreHtml: true })('<!-- cow -->'), true);
	assert.equal(makeCodeblockFilter({ ignoreHtml: true })('- <i>inline</i>'), false);
	assert.equal(makeCodeblockFilter({ ignoreHtml: true })('plain prose'), false);
});

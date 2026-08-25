import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidTemplate, isDateLike, frontmatterEnd } from '../src/validation.ts';

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

test('isDateLike matches dates/numbers, not words', () => {
	assert.equal(isDateLike('2026'), true);
	assert.equal(isDateLike('2026-08-24'), true);
	assert.equal(isDateLike('2026-08-24T23:47:33-05:00'), true);
	assert.equal(isDateLike('Armor Class'), false);
	assert.equal(isDateLike('--'), false);
	assert.equal(isDateLike('v2'), false);
});

test('frontmatterEnd finds the closing fence, or -1', () => {
	assert.equal(frontmatterEnd(['---', 'a: 1', '---', 'body']), 2);
	assert.equal(frontmatterEnd(['no frontmatter', '---']), -1);
	assert.equal(frontmatterEnd([]), -1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidTemplate } from '../src/validation.ts';

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

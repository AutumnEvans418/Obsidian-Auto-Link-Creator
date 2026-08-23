import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTemplate, findAllTemplate, compileTemplate } from '../src/template.ts';

const INLINE = '- {{Link Name}} ({{Link Alias}}) - {{Link Content}}';
const NESTED = '- {{Link Name}} ({{Link Alias}})\n  - {{Link Content}}';

test('matches inline template with alias and content', () => {
	const r = matchTemplate('- Risk Appetite - Level of risk accepted', INLINE);
	assert.equal(r?.name, 'Risk Appetite');
	assert.equal(r?.alias, undefined);
	assert.equal(r?.content, 'Level of risk accepted');
});

test('matches nested children as content', () => {
	const r = matchTemplate(
		'- Access control systems (ACS)\n  - Identification\n  - Authentication',
		NESTED,
	);
	assert.equal(r?.name, 'Access control systems');
	assert.equal(r?.alias, 'ACS');
	assert.equal(r?.content, 'Identification\nAuthentication');
});

test('uppercases nothing - alias separate from name', () => {
	const r = matchTemplate('- Foo (Bar) - baz content', INLINE);
	assert.equal(r?.name, 'Foo');
	assert.equal(r?.alias, 'Bar');
	assert.equal(r?.content, 'baz content');
});

test('null on template without Link Name', () => {
	assert.equal(compileTemplate('- {{Link Content}}'), null);
});

test('null when no line matches', () => {
	assert.equal(matchTemplate('# just a heading', INLINE), null);
});

test('finds all matches in document order', () => {
	const doc = [
		'- Test2 (alias32)',
		'\t- content1',
		'\t- content2',
		'- test3 (alias) - content',
	].join('\n');
	const all = findAllTemplate(doc, NESTED);
	assert.equal(all.length, 2);
	assert.equal(all[0]?.name, 'Test2');
	assert.equal(all[0]?.alias, 'alias32');
	assert.equal(all[0]?.content, 'content1\ncontent2');
	assert.equal(all[1]?.name, 'test3');
	assert.equal(all[1]?.content, undefined);
});

test('rejects blank name line (empty draft)', () => {
	assert.equal(matchTemplate('- ', '- {{Link Name}} - {{Link Content}}'), null);
});

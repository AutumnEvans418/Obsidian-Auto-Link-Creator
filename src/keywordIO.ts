/** On-disk keyword export format: names + aliases + optional body content. */
export interface KeywordRecord {
	name: string;
	aliases: string[];
	content?: string;
}

export const KEYWORDS_FILE_VERSION = 1;

export interface KeywordFile {
	version: number;
	keywords: KeywordRecord[];
}

/** Merge records with the same (case-insensitive) name, keeping the fuller one. */
export function dedupeKeywords(records: KeywordRecord[]): KeywordRecord[] {
	const byName = new Map<string, KeywordRecord>();
	for (const r of records) {
		const key = r.name.toLowerCase();
		const cur = byName.get(key);
		if (!cur) {
			const rec: KeywordRecord = { name: r.name, aliases: [...r.aliases] };
			if (r.content) rec.content = r.content;
			byName.set(key, rec);
			continue;
		}
		for (const a of r.aliases) if (!cur.aliases.some((x) => x.toLowerCase() === a.toLowerCase())) cur.aliases.push(a);
		if (r.content && !cur.content) cur.content = r.content;
	}
	return [...byName.values()];
}

/** JSON-serialize a keyword set for export (stable, versioned). */
export function serializeKeywords(records: KeywordRecord[]): string {
	return JSON.stringify({ version: KEYWORDS_FILE_VERSION, keywords: dedupeKeywords(records) }, null, 2);
}

/**
 * Parse + validate an exported keyword file. Returns an error string on
 * malformed input; never throws on bad JSON.
 */
export function parseKeywords(
	raw: string,
): { records: KeywordRecord[]; error?: string } {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return { records: [], error: 'Invalid JSON in keyword file.' };
	}
	if (typeof data !== 'object' || data === null) {
		return { records: [], error: 'Keyword file has no object.' };
	}
	const kw = (data as { keywords?: unknown }).keywords;
	if (!Array.isArray(kw)) {
		return { records: [], error: 'Keyword file has no "keywords" array.' };
	}
	const records: KeywordRecord[] = [];
	for (const entry of kw) {
		if (typeof entry !== 'object' || entry === null) continue;
		const name = (entry as { name?: unknown }).name;
		const rawAliases = (entry as { aliases?: unknown }).aliases;
		const content = (entry as { content?: unknown }).content;
		if (typeof name !== 'string' || !name.trim()) continue;
		const aliases = Array.isArray(rawAliases)
			? rawAliases.filter((a): a is string => typeof a === 'string' && !!a.trim())
			: [];
		const rec: KeywordRecord = { name: name.trim(), aliases: aliases.map((a) => a.trim()) };
		if (typeof content === 'string' && content.trim()) rec.content = content;
		records.push(rec);
	}
	return { records: dedupeKeywords(records) };
}

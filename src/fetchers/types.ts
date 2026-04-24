export interface FetchResult {
	/** Markdown body ready to append to the note. */
	content: string;
	/** Optional extras that go into frontmatter. */
	meta: Record<string, string | number | string[]>;
	/** Marker for what produced this — useful for frontmatter. */
	source: string;
	/** Whether fetch succeeded meaningfully. */
	ok: boolean;
	/** If ok === false, a short reason. */
	error?: string;
}

export const EMPTY_RESULT: FetchResult = {
	content: "",
	meta: {},
	source: "none",
	ok: false,
	error: "not attempted",
};

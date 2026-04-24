import { requestUrl } from "obsidian";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import type { FetchResult } from "./types";

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
});
turndown.remove(["script", "style", "noscript", "iframe"]);

export async function fetchArticle(url: string, timeoutMs: number): Promise<FetchResult> {
	try {
		const res = await Promise.race([
			requestUrl({
				url,
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
					"Accept": "text/html,application/xhtml+xml",
				},
				throw: false,
			}),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);

		if (res.status < 200 || res.status >= 300) {
			return { content: "", meta: {}, source: "article", ok: false, error: `http ${res.status}` };
		}
		const html = res.text ?? "";
		const doc = new DOMParser().parseFromString(html, "text/html");
		const reader = new Readability(doc);
		const parsed = reader.parse();
		if (!parsed || !parsed.content) {
			return { content: "", meta: {}, source: "article", ok: false, error: "readability empty" };
		}
		const markdown = turndown.turndown(parsed.content).trim();
		const meta: Record<string, string> = {};
		if (parsed.byline) meta.author = parsed.byline;
		if (parsed.siteName) meta.siteName = parsed.siteName;
		if (parsed.lang) meta.lang = parsed.lang;
		if (parsed.excerpt) meta.readability_excerpt = parsed.excerpt;
		return { content: markdown, meta, source: "article", ok: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { content: "", meta: {}, source: "article", ok: false, error: msg };
	}
}

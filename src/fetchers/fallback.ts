import { requestUrl } from "obsidian";
import TurndownService from "turndown";
import type { FetchResult } from "./types";

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
});
turndown.remove(["script", "style", "noscript", "iframe", "nav", "footer", "header", "aside"]);

export async function fetchFallback(url: string, timeoutMs: number): Promise<FetchResult> {
	try {
		const res = await Promise.race([
			requestUrl({
				url,
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
				},
				throw: false,
			}),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);
		if (res.status < 200 || res.status >= 300) {
			return { content: "", meta: {}, source: "fallback", ok: false, error: `http ${res.status}` };
		}
		const html = res.text ?? "";
		const doc = new DOMParser().parseFromString(html, "text/html");
		const main = doc.querySelector("main, article, [role=main]") ?? doc.body;
		if (!main) {
			return { content: "", meta: {}, source: "fallback", ok: false, error: "no body" };
		}
		const markdown = turndown.turndown(main.innerHTML).trim();
		const meta: Record<string, string> = {};
		const title = doc.querySelector("title")?.textContent;
		if (title) meta.pageTitle = title.trim();
		const desc = doc.querySelector('meta[name="description"]')?.getAttribute("content");
		if (desc) meta.pageDescription = desc;
		return { content: markdown, meta, source: "fallback", ok: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { content: "", meta: {}, source: "fallback", ok: false, error: msg };
	}
}

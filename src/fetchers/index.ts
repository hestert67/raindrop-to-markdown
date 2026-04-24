import type { RaindropToMarkdownSettings } from "../settings";
import { detectType } from "../type-detector";
import { fetchArticle } from "./article";
import { fetchYouTube } from "./youtube";
import { fetchGitHub } from "./github";
import { fetchPdf } from "./pdf";
import { fetchFallback } from "./fallback";
import type { FetchResult } from "./types";

export async function fetchContent(
	url: string,
	settings: RaindropToMarkdownSettings,
): Promise<FetchResult> {
	const { type, hints } = detectType(url);
	const timeout = settings.fetchTimeoutMs;

	switch (type) {
		case "youtube":
			if (settings.enableYouTube && hints.videoId) {
				return fetchYouTube(hints.videoId, timeout);
			}
			break;
		case "github":
			if (settings.enableGitHub && hints.owner && hints.repo) {
				return fetchGitHub(hints.owner, hints.repo, settings.githubToken, timeout);
			}
			break;
		case "pdf":
			if (settings.enablePdf) {
				return fetchPdf(url, timeout);
			}
			break;
		case "article": {
			if (settings.enableArticle) {
				const r = await fetchArticle(url, timeout);
				if (r.ok) return r;
			}
			break;
		}
	}

	if (settings.enableFallback) {
		return fetchFallback(url, timeout);
	}
	return { content: "", meta: {}, source: "none", ok: false, error: "all handlers disabled" };
}

export type { FetchResult } from "./types";

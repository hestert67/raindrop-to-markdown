import { requestUrl } from "obsidian";
import type { FetchResult } from "./types";

export async function fetchYouTube(videoId: string, timeoutMs: number): Promise<FetchResult> {
	try {
		const watchRes = await Promise.race([
			requestUrl({
				url: `https://www.youtube.com/watch?v=${videoId}&hl=en`,
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
					"Accept-Language": "en-US,en;q=0.9",
				},
				throw: false,
			}),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);

		if (watchRes.status < 200 || watchRes.status >= 300) {
			return { content: "", meta: {}, source: "youtube", ok: false, error: `http ${watchRes.status}` };
		}

		const html = watchRes.text ?? "";
		const meta: Record<string, string> = { videoId };
		const titleMatch = html.match(/<meta name="title" content="([^"]+)"/);
		if (titleMatch) meta.ytTitle = decodeHtml(titleMatch[1]);
		const authorMatch = html.match(/"author":"([^"]+)"/);
		if (authorMatch) meta.ytAuthor = JSON.parse(`"${authorMatch[1]}"`);
		const descMatch = html.match(/"shortDescription":"([\s\S]*?)","isCrawlable"/);
		const description = descMatch ? JSON.parse(`"${descMatch[1]}"`) : "";

		const tracks = extractCaptionTracks(html);
		let transcript = "";
		if (tracks.length > 0) {
			const track = pickTrack(tracks);
			transcript = await fetchTranscript(track.baseUrl, timeoutMs);
		}

		const body: string[] = [];
		if (meta.ytAuthor) body.push(`**Channel:** ${meta.ytAuthor}`);
		body.push(`**Video:** https://www.youtube.com/watch?v=${videoId}`);
		if (description) body.push("\n### Description\n\n" + description.trim());
		if (transcript) {
			body.push("\n### Transcript\n\n" + transcript);
		} else {
			body.push("\n_No transcript available._");
		}

		return {
			content: body.join("\n"),
			meta,
			source: "youtube",
			ok: true,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { content: "", meta: {}, source: "youtube", ok: false, error: msg };
	}
}

interface CaptionTrack {
	baseUrl: string;
	languageCode: string;
	kind?: string;
}

function extractCaptionTracks(html: string): CaptionTrack[] {
	const m = html.match(/"captionTracks":(\[.*?\])/);
	if (!m) return [];
	try {
		const arr = JSON.parse(m[1]) as Array<{ baseUrl: string; languageCode: string; kind?: string }>;
		return arr.map((t) => ({
			baseUrl: t.baseUrl.replace(/\\u0026/g, "&"),
			languageCode: t.languageCode,
			kind: t.kind,
		}));
	} catch {
		return [];
	}
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack {
	const manualEn = tracks.find((t) => t.languageCode === "en" && !t.kind);
	if (manualEn) return manualEn;
	const anyEn = tracks.find((t) => t.languageCode === "en");
	if (anyEn) return anyEn;
	return tracks[0];
}

async function fetchTranscript(baseUrl: string, timeoutMs: number): Promise<string> {
	try {
		const res = await Promise.race([
			requestUrl({ url: baseUrl, throw: false }),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);
		if (res.status < 200 || res.status >= 300) return "";
		const xml = res.text ?? "";
		const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeHtml(m[1]));
		return segments.join(" ").replace(/\s+/g, " ").trim();
	} catch {
		return "";
	}
}

function decodeHtml(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/\n/g, " ");
}

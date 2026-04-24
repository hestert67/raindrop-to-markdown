import { requestUrl } from "obsidian";
import type { FetchResult } from "./types";

const CONSENT_COOKIE = "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMzE5LjA2X3AwGgJlbiACGgYIgIvQrwY";

const BROWSER_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
	"Accept-Language": "en-US,en;q=0.9",
	"Cookie": CONSENT_COOKIE,
};

export async function fetchYouTube(videoId: string, timeoutMs: number): Promise<FetchResult> {
	try {
		const watchRes = await Promise.race([
			requestUrl({
				url: `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`,
				headers: BROWSER_HEADERS,
				throw: false,
			}),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);

		if (watchRes.status < 200 || watchRes.status >= 300) {
			return { content: "", meta: {}, source: "youtube", ok: false, error: `http ${watchRes.status}` };
		}

		const html = watchRes.text ?? "";

		if (isConsentPage(html)) {
			return {
				content: "",
				meta: { videoId },
				source: "youtube",
				ok: false,
				error: "youtube returned consent page (cookie not accepted)",
			};
		}

		const meta: Record<string, string> = { videoId };
		const title = extractMetaContent(html, "title") ?? extractOg(html, "title");
		if (title) meta.ytTitle = title;
		const author = matchJson(html, /"author":"([^"]+)"/);
		if (author) meta.ytAuthor = author;
		const channel = matchJson(html, /"ownerChannelName":"([^"]+)"/);
		if (channel && !meta.ytAuthor) meta.ytAuthor = channel;
		const lengthSec = matchJson(html, /"lengthSeconds":"(\d+)"/);
		if (lengthSec) meta.ytLengthSeconds = lengthSec;
		const publishDate = matchJson(html, /"publishDate":"([^"]+)"/);
		if (publishDate) meta.ytPublishDate = publishDate;
		const isShort = /"isShortsEligible":true|"webCommandMetadata":\{[^}]*"url":"\/shorts\//.test(html);
		if (isShort) meta.ytShort = "true";

		const description = extractDescription(html);

		const { transcript, reason } = await tryTranscript(html, timeoutMs);
		if (!transcript && reason) meta.transcriptReason = reason;

		const body: string[] = [];
		if (meta.ytAuthor) body.push(`**Channel:** ${meta.ytAuthor}`);
		if (meta.ytPublishDate) body.push(`**Published:** ${meta.ytPublishDate}`);
		if (meta.ytLengthSeconds) body.push(`**Length:** ${formatLength(Number(meta.ytLengthSeconds))}`);
		body.push(`**Video:** https://www.youtube.com/watch?v=${videoId}`);
		if (description) body.push("\n### Description\n\n" + description.trim());
		if (transcript) {
			body.push("\n### Transcript\n\n" + transcript);
		} else {
			body.push(`\n_No transcript: ${reason ?? "unknown reason"}._`);
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

function isConsentPage(html: string): boolean {
	return (
		html.includes("consent.youtube.com") ||
		html.includes('action="https://consent.youtube.com/save"') ||
		(html.length < 50000 && html.includes("Before you continue"))
	);
}

function extractMetaContent(html: string, name: string): string | null {
	const re = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]+)"`, "i");
	const m = html.match(re);
	return m ? decodeHtml(m[1]) : null;
}

function extractOg(html: string, key: string): string | null {
	const re = new RegExp(`<meta\\s+property="og:${key}"\\s+content="([^"]+)"`, "i");
	const m = html.match(re);
	return m ? decodeHtml(m[1]) : null;
}

function matchJson(html: string, re: RegExp): string | null {
	const m = html.match(re);
	if (!m) return null;
	try {
		return JSON.parse(`"${m[1]}"`);
	} catch {
		return m[1];
	}
}

function extractDescription(html: string): string {
	const patterns = [
		/"shortDescription":"([\s\S]*?)","isCrawlable"/,
		/"shortDescription":"([\s\S]*?)"[,}]/,
		/<meta\s+name="description"\s+content="([^"]+)"/i,
		/<meta\s+property="og:description"\s+content="([^"]+)"/i,
	];
	for (const re of patterns) {
		const m = html.match(re);
		if (m) {
			try {
				return JSON.parse(`"${m[1]}"`);
			} catch {
				return decodeHtml(m[1]);
			}
		}
	}
	return "";
}

interface TranscriptAttempt {
	transcript: string;
	reason: string | null;
}

async function tryTranscript(html: string, timeoutMs: number): Promise<TranscriptAttempt> {
	const tracks = extractCaptionTracks(html);
	if (tracks.length === 0) {
		return { transcript: "", reason: "no caption tracks (video has no captions)" };
	}
	const track = pickTrack(tracks);
	const text = await fetchTranscript(track.baseUrl, timeoutMs);
	if (!text) return { transcript: "", reason: "caption fetch empty" };
	return { transcript: text, reason: null };
}

interface CaptionTrack {
	baseUrl: string;
	languageCode: string;
	kind?: string;
}

function extractCaptionTracks(html: string): CaptionTrack[] {
	const patterns = [/"captionTracks":(\[[^\]]*\])/, /"captionTracks":(\[.*?\])/];
	for (const re of patterns) {
		const m = html.match(re);
		if (!m) continue;
		try {
			const arr = JSON.parse(m[1]) as Array<{ baseUrl: string; languageCode: string; kind?: string }>;
			return arr.map((t) => ({
				baseUrl: t.baseUrl.replace(/\\u0026/g, "&"),
				languageCode: t.languageCode,
				kind: t.kind,
			}));
		} catch {
			// try next pattern
		}
	}
	return [];
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
			requestUrl({ url: baseUrl, headers: BROWSER_HEADERS, throw: false }),
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

function formatLength(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return m > 0 ? `${m}m ${s}s` : `${s}s`;
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

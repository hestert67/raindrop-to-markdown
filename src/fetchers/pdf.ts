import { requestUrl } from "obsidian";
import type { FetchResult } from "./types";

export async function fetchPdf(url: string, timeoutMs: number): Promise<FetchResult> {
	try {
		const res = await Promise.race([
			requestUrl({ url, throw: false }),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);
		if (res.status < 200 || res.status >= 300) {
			return { content: "", meta: {}, source: "pdf", ok: false, error: `http ${res.status}` };
		}
		const bytes = res.arrayBuffer;
		const text = await extractPdfText(bytes);
		if (!text.trim()) {
			return { content: "", meta: {}, source: "pdf", ok: false, error: "no extractable text" };
		}
		return {
			content: text,
			meta: { byteLength: bytes.byteLength },
			source: "pdf",
			ok: true,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { content: "", meta: {}, source: "pdf", ok: false, error: msg };
	}
}

/**
 * Lazy-load pdfjs-dist only when a PDF is actually encountered.
 * Keeps bundle size down for users who never import PDFs.
 */
async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
	// @ts-ignore — dynamic import, resolved at runtime if dep installed
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => null);
	if (!pdfjs) {
		throw new Error("pdfjs-dist not installed. Run: npm install pdfjs-dist");
	}
	// @ts-ignore
	pdfjs.GlobalWorkerOptions.workerSrc = "";
	const loadingTask = pdfjs.getDocument({ data: buffer } as unknown as { data: ArrayBuffer });
	const pdf = await loadingTask.promise;
	const pages: string[] = [];
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		const text = (content.items as Array<{ str?: string }>)
			.map((it) => it.str ?? "")
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		pages.push(`### Page ${i}\n\n${text}`);
	}
	return pages.join("\n\n");
}

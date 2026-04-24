import { requestUrl } from "obsidian";

export interface RaindropBookmark {
	_id: number;
	title: string;
	excerpt: string;
	note: string;
	link: string;
	domain: string;
	type: string;
	tags: string[];
	cover: string;
	created: string;
	lastUpdate: string;
	collection: { $id: number; title?: string };
	highlights?: Array<{ _id: string; text: string; note: string; color: string; created: string }>;
}

export interface RaindropCollection {
	_id: number;
	title: string;
	count: number;
}

export interface RaindropUser {
	_id: number;
	email: string;
	fullName: string;
}

const BASE = "https://api.raindrop.io/rest/v1";

export class RaindropAPI {
	constructor(private token: string) {}

	private async request<T>(path: string): Promise<T> {
		const res = await requestUrl({
			url: `${BASE}${path}`,
			headers: { Authorization: `Bearer ${this.token}` },
			throw: false,
		});
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`Raindrop ${res.status}: ${res.text?.slice(0, 200)}`);
		}
		return res.json as T;
	}

	async getUser(): Promise<RaindropUser> {
		const res = await this.request<{ user: RaindropUser }>("/user");
		return res.user;
	}

	async listCollections(): Promise<RaindropCollection[]> {
		const res = await this.request<{ items: RaindropCollection[] }>("/collections");
		return res.items;
	}

	async getBookmarksPage(
		collectionId: number,
		page: number,
		perPage = 50,
	): Promise<{ items: RaindropBookmark[]; count: number }> {
		const path = `/raindrops/${collectionId}?page=${page}&perpage=${perPage}&sort=-created`;
		return this.request<{ items: RaindropBookmark[]; count: number }>(path);
	}

	/**
	 * Async iterator over every bookmark in a collection (or 0 = all).
	 * Emits one bookmark at a time; caller paces fetches.
	 */
	async *iterateBookmarks(
		collectionId: number,
		perPage = 50,
	): AsyncGenerator<RaindropBookmark, void, void> {
		let page = 0;
		while (true) {
			const { items } = await this.getBookmarksPage(collectionId, page, perPage);
			if (!items || items.length === 0) return;
			for (const item of items) yield item;
			if (items.length < perPage) return;
			page += 1;
		}
	}

	async getTotalCount(collectionId: number): Promise<number> {
		const { count } = await this.getBookmarksPage(collectionId, 0, 1);
		return count;
	}
}

export function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

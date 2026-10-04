import type { ArticlePage, JsonDocument, PublicArticle } from "./types";
export class PostparticleClient {
  constructor(
    private baseUrl: string,
    private projectId: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async get<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/v1/projects/${encodeURIComponent(this.projectId)}/${path}`;
    const response = await this.fetcher(url, init);
    if (!response.ok)
      throw new Error(`Postparticle returned ${response.status}`);
    return response.json() as Promise<T>;
  }
  articles(
    query: {
      q?: string;
      tag?: string;
      order?: "asc" | "desc";
      page?: number;
      pageSize?: number;
    } = {},
    init?: RequestInit,
  ) {
    const params = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)]),
    );
    return this.get<ArticlePage>(`articles?${params}`, init);
  }
  article(slug: string, init?: RequestInit) {
    return this.get<PublicArticle>(
      `articles/${encodeURIComponent(slug)}`,
      init,
    );
  }
  document<T = unknown>(key: string, init?: RequestInit) {
    return this.get<Omit<JsonDocument, "value"> & { value: T }>(
      `documents/${encodeURIComponent(key)}`,
      init,
    );
  }
}

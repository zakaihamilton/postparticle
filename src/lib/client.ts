import type { ArticlePage, JsonDocument, PublicArticle } from "./types";
export class PostparticleClient {
  private organizationId?: string;
  private fetcher: typeof fetch;

  constructor(
    private baseUrl: string,
    private projectId: string,
    organizationIdOrFetcher: string | typeof fetch = fetch,
    fetcher: typeof fetch = fetch,
  ) {
    if (typeof organizationIdOrFetcher === "function") {
      this.fetcher = organizationIdOrFetcher;
    } else {
      this.organizationId = organizationIdOrFetcher;
      this.fetcher = fetcher;
    }
  }

  private async get<T>(path: string, init?: RequestInit): Promise<T> {
    const base = `${this.baseUrl.replace(/\/$/, "")}/api/v1/projects/${encodeURIComponent(this.projectId)}/${path}`;
    const separator = path.includes("?") ? "&" : "?";
    const url = this.organizationId
      ? `${base}${separator}organizationId=${encodeURIComponent(this.organizationId)}`
      : base;
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
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
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

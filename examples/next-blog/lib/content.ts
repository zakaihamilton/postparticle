import "server-only";
import { connection } from "next/server";
import { notFound } from "next/navigation";

export interface PublicArticle {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  author: string;
  tags: string[];
  articleDate: string;
  seoTitle: string;
  seoDescription: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  coverUrl: string | null;
  socialImageUrl: string | null;
}
export interface ArticlePage {
  items: PublicArticle[];
  total: number;
  page: number;
  pageSize: number;
}
interface ArticleQuery {
  q?: string;
  tag?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
export const websiteUrl = process.env.WEBSITE_URL || "http://localhost:3001";
const cmsUrl = process.env.POSTPARTICLE_URL || "http://localhost:3000";
const project = process.env.POSTPARTICLE_PROJECT || "demo";

class ContentError extends Error {
  constructor(public status: number) {
    super(`Postparticle returned ${status}`);
  }
}
async function get<T>(path: string): Promise<T> {
  // Fetch at request time so a build does not depend on a running CMS.
  await connection();
  const response = await fetch(
    `${cmsUrl.replace(/\/$/, "")}/api/v1/projects/${encodeURIComponent(project)}/${path}`,
    { next: { revalidate: 60 } },
  );
  if (!response.ok) throw new ContentError(response.status);
  return response.json() as Promise<T>;
}
export function getArticles(query: ArticleQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return get<ArticlePage>(`articles?${params}`);
}
export async function getArticle(slug: string) {
  try {
    return await get<PublicArticle>(`articles/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof ContentError && error.status === 404) notFound();
    throw error;
  }
}

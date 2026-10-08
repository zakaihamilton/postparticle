export type Role = "admin" | "editor" | "viewer";
export type Kind = "articles" | "documents";
export interface Project {
  id: string;
  name: string;
  description: string;
}
export interface Actor {
  username: string;
  platformAdmin: boolean;
}
export interface Article {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  author: string;
  tags: string[];
  articleDate: string;
  coverMediaId: string;
  seoTitle: string;
  seoDescription: string;
  socialMediaId: string;
}
export interface JsonDocument {
  key: string;
  title: string;
  tags: string[];
  value: unknown;
}
export type Content = Article | JsonDocument;
export interface Event<T> {
  id: string;
  at: string;
  actor: string;
  action: string;
  data: T;
}
export interface RecordState<T = Content> {
  id: string;
  draft: T;
  published: T | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  trashed: boolean;
  revision: string;
}
export interface Media {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  alt: string;
  caption: string;
  metadata: unknown;
  createdAt: string;
  ready: boolean;
  deleted: boolean;
}
export interface PublicArticle extends Omit<
  Article,
  "coverMediaId" | "socialMediaId"
> {
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

export type Role = "admin" | "editor" | "viewer";
export type Kind = "articles" | "documents";
export interface Project {
  id: string;
  name: string;
  description: string;
  production?: boolean;
  archived?: boolean;
  deleting?: boolean;
}
interface OrganizationChoice {
  organizationId: string;
  organizationName: string;
  platformAdmin: boolean;
}
export interface Actor {
  username: string;
  organizationId: string;
  organizationName: string;
  organizations: OrganizationChoice[];
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
export interface ContentListRow {
  id: string;
  draft: {
    title: string;
    tags: string[];
    author?: string;
    articleDate?: string;
    key?: string;
  };
  published: boolean;
  trashed: boolean;
  updatedAt: string;
}
export interface ContentListData {
  rows: ContentListRow[];
  recordCount: number;
  activeCount: number;
}
export interface WorkspaceDashboard {
  articleCount: number;
  publishedCount: number;
  mediaCount: number;
  recentArticles: {
    id: string;
    draft: Pick<Article, "title" | "author" | "tags" | "articleDate">;
    published: boolean;
    trashed: boolean;
    updatedAt: string;
  }[];
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
export interface EditorHistoryItem {
  id: string;
  at: string;
  actor: string;
  title: string;
}
export interface EditorData {
  record: RecordState | null;
  media?: Media[];
  mediaError?: string;
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
export type PublicArticleMetadata = Omit<PublicArticle, "body">;
export interface ArticleMetadataPage {
  items: PublicArticleMetadata[];
  total: number;
  page: number;
  pageSize: number;
}

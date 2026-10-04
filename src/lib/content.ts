import "server-only";
import { z } from "zod";
import { append, events } from "./events";
import { HttpError, identifier } from "./config";
import { replaceMediaReferences } from "./media-references";
import type { Store } from "./storage";
import type {
  Article,
  Content,
  Event,
  JsonDocument,
  Kind,
  RecordState,
} from "./types";
const tags = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .transform((v) => [...new Set(v.map((t) => t.toLowerCase()))]);
const mediaId = z.union([z.literal(""), z.string().uuid()]);
export const articleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: identifier.refine((s) => s !== "new", "This slug is reserved"),
  excerpt: z.string().max(1000),
  body: z.string().max(500_000),
  author: z.string().trim().min(1).max(100),
  tags,
  articleDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(s);
      return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, "Invalid article date"),
  coverMediaId: mediaId,
  seoTitle: z.string().max(200),
  seoDescription: z.string().max(500),
  socialMediaId: mediaId,
});
const documentSchema = z.object({
  key: identifier.refine((s) => s !== "new", "This key is reserved"),
  title: z.string().trim().min(1).max(200),
  tags,
  value: z.json(),
});
function parseContent(kind: Kind, input: unknown): Content {
  return kind === "articles"
    ? articleSchema.parse(input)
    : documentSchema.parse(input);
}
function reduceContent<T extends Content>(
  id: string,
  history: Event<T>[],
): RecordState<T> | null {
  let draft: T | null = null;
  let published: T | null = null;
  let trashed = false;
  let createdAt = "";
  let updatedAt = "";
  let publishedAt: string | null = null;
  let revision = "";
  for (const event of [...history].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    if (event.action === "save") {
      draft = event.data;
      createdAt ||= event.at;
      updatedAt = event.at;
      revision = event.id;
    }
    if (event.action === "publish") {
      published = event.data;
      publishedAt = event.at;
    }
    if (event.action === "unpublish") {
      published = null;
      publishedAt = null;
    }
    if (event.action === "trash") {
      trashed = true;
      published = null;
      publishedAt = null;
    }
    if (event.action === "restore") trashed = false;
  }
  if (!draft) return null;
  return {
    id,
    draft,
    published,
    trashed,
    createdAt,
    updatedAt,
    publishedAt,
    revision,
  };
}
export async function getRecord(kind: Kind, id: string, store: Store) {
  identifier.parse(id);
  return reduceContent(
    id,
    await events<Content>(store, `content/${kind}/${id}`),
  );
}
export async function records(kind: Kind, store: Store) {
  const history = await events<Content>(store, `content/${kind}`);
  const groups = new Map<string, Event<Content>[]>();
  // IDs are part of each content payload, so no shared mutable index is needed.
  for (const event of history) {
    const id =
      kind === "articles"
        ? (event.data as Article).slug
        : (event.data as JsonDocument).key;
    const group = groups.get(id) ?? [];
    group.push(event);
    groups.set(id, group);
  }
  return [...groups].flatMap(([id, group]) => {
    const state = reduceContent(id, group);
    return state ? [state] : [];
  });
}
export async function saveContent(
  kind: Kind,
  actor: string,
  input: unknown,
  store: Store,
) {
  const data = parseContent(kind, input);
  const id =
    kind === "articles" ? (data as Article).slug : (data as JsonDocument).key;
  const state = await getRecord(kind, id, store);
  if (state?.trashed)
    throw new HttpError(409, "Restore this item before editing it");
  await append(store, `content/${kind}/${id}`, actor, "save", data);
  return id;
}
export async function contentAction(
  kind: Kind,
  id: string,
  actor: string,
  action: "publish" | "unpublish" | "trash" | "restore",
  store: Store,
  revision?: string,
) {
  const state = await getRecord(kind, id, store);
  if (!state) throw new HttpError(404, "Content not found");
  if (state.trashed && action !== "restore")
    throw new HttpError(409, "Restore this item first");
  let data = state.draft;
  if (revision) {
    const old = (await events<Content>(store, `content/${kind}/${id}`)).find(
      (e) => e.id === revision && e.action === "save",
    );
    if (!old) throw new HttpError(404, "Revision not found");
    data = old.data;
  }
  await append(store, `content/${kind}/${id}`, actor, action, data);
}
export async function restoreRevision(
  kind: Kind,
  id: string,
  actor: string,
  revision: string,
  store: Store,
) {
  const state = await getRecord(kind, id, store);
  if (!state || state.trashed)
    throw new HttpError(409, "Restore the item first");
  const old = (await events<Content>(store, `content/${kind}/${id}`)).find(
    (e) => e.id === revision && e.action === "save",
  );
  if (!old) throw new HttpError(404, "Revision not found");
  await saveContent(kind, actor, old.data, store);
}
export function mediaReferences(content: unknown, kind?: Kind): string[] {
  const refs = new Set<string>();
  function walk(value: unknown) {
    if (typeof value === "string") {
      replaceMediaReferences(value, (id) => {
        refs.add(id);
        return `media:${id}`;
      });
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      Object.values(value).forEach(walk);
  }
  walk(content);
  // Implicit IDs belong only to the article envelope, never arbitrary JSON fields.
  if (kind === "articles") {
    const article = articleSchema.parse(content);
    for (const id of [article.coverMediaId, article.socialMediaId])
      if (id) refs.add(id.toLowerCase());
  }
  return [...refs];
}

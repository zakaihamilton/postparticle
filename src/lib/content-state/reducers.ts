import "server-only";
import { identifier } from "../config";
import {
  type ContentEventFeedEntry,
  contentEventFeedKey,
  contentEventFeedPrefix,
} from "../events";
import type {
  Article,
  Content,
  Event,
  JsonDocument,
  Kind,
  RecordState,
  WorkspaceDashboardArticle,
} from "../types";

export function eventPrefix(kind: Kind) {
  return `content/${kind}`;
}

export function feedHour(at: string) {
  const date = new Date(at);
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCHours()).padStart(2, "0"),
  ].join("/");
}

export function eventTimeKeyFromPath(key: string) {
  const filename = key.slice(key.lastIndexOf("/") + 1).replace(/\.json$/, "");
  const separator = filename.lastIndexOf("_");
  return separator < 0 ? "" : filename.slice(0, separator);
}

export function eventTimeKey(at: string) {
  return at.replace(/[:.]/g, "-");
}

export function isFeedEntry(
  value: unknown,
  kind: Kind,
  key: string,
): value is ContentEventFeedEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ContentEventFeedEntry>;
  if (
    entry.version !== 1 ||
    entry.kind !== kind ||
    typeof entry.recordId !== "string" ||
    typeof entry.eventId !== "string" ||
    typeof entry.at !== "string" ||
    !Number.isFinite(Date.parse(entry.at)) ||
    typeof entry.action !== "string"
  )
    return false;
  try {
    identifier.parse(entry.recordId);
  } catch {
    return false;
  }
  const filename = key.slice(key.lastIndexOf("/") + 1).replace(/\.json$/, "");
  const prefix = `${contentEventFeedPrefix(kind)}${feedHour(entry.at)}/`;
  return (
    entry.eventId === filename &&
    key === contentEventFeedKey(kind, entry.at, entry.eventId) &&
    key.startsWith(prefix) &&
    eventTimeKey(entry.at) === eventTimeKeyFromPath(key)
  );
}

export function eventKeysById(kind: Kind, keys: string[]) {
  const prefix = `${eventPrefix(kind)}/`;
  const grouped = new Map<string, string[]>();
  for (const key of keys) {
    if (!key.startsWith(prefix) || !key.endsWith(".json")) continue;
    const rest = key.slice(prefix.length).split("/");
    if (rest.length !== 2) continue;
    const [id, file] = rest;
    if (!file.endsWith(".json")) continue;
    try {
      identifier.parse(id);
    } catch {
      continue;
    }
    const group = grouped.get(id) ?? [];
    group.push(key);
    grouped.set(id, group);
  }
  for (const group of grouped.values()) group.sort();
  return grouped;
}

export function eventFromKey<T>(value: unknown, key: string): value is Event<T> {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<Event<T>>;
  const filename = key.slice(key.lastIndexOf("/") + 1).replace(/\.json$/, "");
  return (
    typeof event.id === "string" &&
    event.id === filename &&
    typeof event.at === "string" &&
    Number.isFinite(Date.parse(event.at)) &&
    eventTimeKey(event.at) === eventTimeKeyFromPath(key) &&
    typeof event.action === "string"
  );
}

export function eventMatchesPath(kind: Kind, value: unknown, key: string) {
  if (!eventFromKey<Content>(value, key)) return false;
  const recordId = key.split("/").at(-2);
  const contentId =
    kind === "articles"
      ? (value.data as Article | undefined)?.slug
      : (value.data as JsonDocument | undefined)?.key;
  return recordId === contentId;
}

export function reduceContent<T extends Content>(
  id: string,
  history: Event<T>[],
  initial: RecordState<T> | null = null,
): RecordState<T> | null {
  let draft: T | null = initial?.draft ?? null;
  let published: T | null = initial?.published ?? null;
  let trashed = initial?.trashed ?? false;
  let createdAt = initial?.createdAt ?? "";
  let updatedAt = initial?.updatedAt ?? "";
  let publishedAt: string | null = initial?.publishedAt ?? null;
  let revision = initial?.revision ?? "";
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

export function dashboardArticleFromState(
  state: RecordState<Content>,
): WorkspaceDashboardArticle {
  const draft = state.draft as Article;
  return {
    id: state.id,
    draft: {
      title: draft.title,
      author: draft.author,
      tags: draft.tags,
      articleDate: draft.articleDate,
    },
    published: !!state.published,
    trashed: state.trashed,
    updatedAt: state.updatedAt,
  };
}

export function reduceDashboardArticle(
  id: string,
  history: Event<Content>[],
  initial: WorkspaceDashboardArticle | null,
): WorkspaceDashboardArticle | null {
  let draft = initial?.draft ?? null;
  let published = initial?.published ?? false;
  let trashed = initial?.trashed ?? false;
  let updatedAt = initial?.updatedAt ?? "";
  for (const event of [...history].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    if (event.action === "save") {
      const article = event.data as Article;
      draft = {
        title: article.title,
        author: article.author,
        tags: article.tags,
        articleDate: article.articleDate,
      };
      updatedAt = event.at;
    }
    if (event.action === "publish") published = true;
    if (event.action === "unpublish") published = false;
    if (event.action === "trash") {
      trashed = true;
      published = false;
    }
    if (event.action === "restore") trashed = false;
  }
  if (!draft) return null;
  return { id, draft, published, trashed, updatedAt };
}

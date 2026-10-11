import "server-only";
import { randomUUID } from "node:crypto";
import type { Event } from "./types";
import type { Store } from "./storage";
import { mapBounded } from "./storage";
import type { Kind } from "./types";

export interface ContentEventFeedEntry {
  version: 1;
  kind: Kind;
  recordId: string;
  eventId: string;
  at: string;
  action: string;
}

const contentFeedRoot = (kind: Kind) => `indexes/content/${kind}/feed`;

export function contentEventFeedKey(kind: Kind, at: string, eventId: string) {
  const date = new Date(at);
  const partition = [
    date.getUTCFullYear().toString().padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCHours()).padStart(2, "0"),
  ].join("/");
  return `${contentFeedRoot(kind)}/${partition}/${eventId}.json`;
}

export function contentEventFeedPrefix(kind: Kind) {
  return `${contentFeedRoot(kind)}/`;
}
export async function append<T>(
  store: Store,
  prefix: string,
  actor: string,
  action: string,
  data: T,
) {
  const keys = (await store.list(`${prefix}/`))
    .filter((key) => key.endsWith(".json"))
    .sort();
  const previous = keys.length ? await store.get<Event<T>>(keys.at(-1)!) : null;
  const at = new Date(
    Math.max(Date.now(), previous ? Date.parse(previous.at) + 1 : 0),
  ).toISOString();
  const id = `${at.replace(/[:.]/g, "-")}_${randomUUID()}`;
  const event: Event<T> = { id, at, actor, action, data };
  const contentStream =
    /^content\/(articles|documents)\/([a-z0-9][a-z0-9_-]{0,79})$/.exec(prefix);
  if (contentStream) {
    const kind = contentStream[1] as Kind;
    const recordId = contentStream[2];
    const dataId =
      kind === "articles"
        ? (data as { slug?: unknown } | null)?.slug
        : (data as { key?: unknown } | null)?.key;
    if (dataId !== recordId)
      throw new Error("Content event does not match its record path");
    const indexEntry: ContentEventFeedEntry = {
      version: 1,
      kind,
      recordId,
      eventId: id,
      at,
      action,
    };
    // The index is written first. A failed source write leaves a harmless dangling
    // feed entry; a committed content event therefore always has an index entry.
    await store.put(contentEventFeedKey(kind, at, id), indexEntry);
  }
  await store.put(`${prefix}/${id}.json`, event);
  return event;
}
export async function events<T>(
  store: Store,
  prefix: string,
): Promise<Event<T>[]> {
  const keys = await store.list(`${prefix}/`);
  const result = await mapBounded(
    keys.filter((k) => k.endsWith(".json")),
    (k) => store.get<Event<T>>(k),
  );
  return result
    .filter((v): v is Event<T> => !!v)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

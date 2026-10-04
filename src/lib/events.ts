import "server-only";
import { randomUUID } from "node:crypto";
import type { Event } from "./types";
import type { Store } from "./storage";
import { mapBounded } from "./storage";
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

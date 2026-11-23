import "server-only";
import { identifier } from "../config";
import { type ContentEventFeedEntry, contentEventFeedPrefix } from "../events";
import { mapBounded, type Store } from "../storage";
import type {
  Article,
  Content,
  Event,
  JsonDocument,
  Kind,
  RecordState,
  WorkspaceDashboardArticle,
} from "../types";
import {
  type CheckpointManifest,
  type CheckpointRow,
  type ContentIndexStatus,
  checkpointPrefix,
  checkpointVersion,
  generationFromManifestKey,
  isCheckpointRow,
  isDashboardArticle,
  isManifest,
  readVerifiedShard,
  type ShardDescriptor,
} from "./checkpoint-codec";
import {
  eventKeysById,
  eventMatchesPath,
  eventPrefix,
  eventTimeKey,
  eventTimeKeyFromPath,
  feedHour,
  isFeedEntry,
  reduceContent,
  reduceDashboardArticle,
} from "./reducers";

async function checkpointManifests(kind: Kind, store: Store) {
  return (await store.list(`${checkpointPrefix(kind)}/`))
    .map((key) => ({ key, generation: generationFromManifestKey(kind, key) }))
    .filter(
      (item): item is { key: string; generation: string } => !!item.generation,
    )
    .sort((a, b) => b.generation.localeCompare(a.generation));
}

async function readManifest(
  kind: Kind,
  store: Store,
  candidate: { key: string; generation: string },
) {
  let value: unknown;
  try {
    value = await store.get<unknown>(candidate.key);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return isManifest(value, kind, candidate.generation)
    ? (value as CheckpointManifest)
    : null;
}

async function readVerifiedGenerationRows<T extends { id: string }>(
  manifest: CheckpointManifest,
  descriptors: ShardDescriptor[],
  options: {
    version: number;
    kind: Kind;
    isRow: (value: unknown) => value is T;
  },
  store: Store,
) {
  const shards = await mapBounded(descriptors, (descriptor) =>
    readVerifiedShard(
      { ...options, generation: manifest.generation },
      descriptor,
      store,
    ),
  );
  if (shards.some((rows) => !rows)) return null;
  const rows = (shards as T[][]).flat();
  if (
    rows.length !== manifest.records ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    return null;
  return { manifest, rows: new Map(rows.map((row) => [row.id, row])) };
}

export async function readCompleteDashboardGeneration(store: Store) {
  for (const candidate of await checkpointManifests("articles", store)) {
    const manifest = await readManifest("articles", store, candidate);
    if (!manifest?.dashboardShards) continue;
    const generation = await readVerifiedGenerationRows(
      manifest,
      manifest.dashboardShards,
      { version: 1, kind: "articles", isRow: isDashboardArticle },
      store,
    );
    if (generation) return generation;
  }
  return null;
}

async function readCompleteGeneration(kind: Kind, store: Store) {
  for (const candidate of await checkpointManifests(kind, store)) {
    const generation = await readGeneration(kind, store, candidate);
    if (generation) return generation;
  }
  return null;
}

async function readCheckpointRecord(
  kind: Kind,
  id: string,
  store: Store,
): Promise<{ manifest: CheckpointManifest; row: CheckpointRow | null } | null> {
  for (const candidate of await checkpointManifests(kind, store)) {
    const manifest = await readManifest(kind, store, candidate);
    if (!manifest) continue;
    const descriptor = manifest.shards.find(
      (shard) => id >= shard.firstId && id <= shard.lastId,
    );
    if (!descriptor) return { manifest, row: null };
    const rows = await readVerifiedShard(
      {
        version: checkpointVersion,
        kind,
        generation: manifest.generation,
        isRow: isCheckpointRow,
      },
      descriptor,
      store,
    );
    if (!rows) continue;
    return { manifest, row: rows.find((row) => row.id === id) ?? null };
  }
  return null;
}

export async function readGeneration(
  kind: Kind,
  store: Store,
  candidate: { key: string; generation: string },
) {
  const manifest = await readManifest(kind, store, candidate);
  if (!manifest) return null;
  return readVerifiedGenerationRows(
    manifest,
    manifest.shards,
    { version: checkpointVersion, kind, isRow: isCheckpointRow },
    store,
  );
}

async function readEventKeys<T extends Content>(
  keys: string[],
  cutoffAt: string | null,
  store: Store,
) {
  const cutoff = cutoffAt ? eventTimeKey(cutoffAt) : "";
  const selected = cutoffAt
    ? keys.filter((key) => eventTimeKeyFromPath(key) >= cutoff)
    : keys;
  return (await mapBounded(selected, (key) => store.get<Event<T>>(key))).filter(
    (event): event is Event<T> => !!event,
  );
}

export async function readContentFeedTail(
  kind: Kind,
  cutoffAt: string,
  store: Store,
  onlyRecordId?: string,
): Promise<Event<Content>[] | null> {
  const prefix = contentEventFeedPrefix(kind);
  const marker = `${prefix}${feedHour(cutoffAt)}/`;
  const cutoff = eventTimeKey(cutoffAt);
  const keys = (await store.list(prefix, marker)).filter(
    (key) => key.endsWith(".json") && eventTimeKeyFromPath(key) >= cutoff,
  );
  const rawEntries = await mapBounded(keys, (key) => store.get<unknown>(key));
  const entries: ContentEventFeedEntry[] = [];
  for (const [index, value] of rawEntries.entries()) {
    if (!isFeedEntry(value, kind, keys[index])) return null;
    entries.push(value);
  }

  const relevant = entries.filter(
    (entry) => !onlyRecordId || entry.recordId === onlyRecordId,
  );
  const loaded = await mapBounded(relevant, async (entry) => {
    const key = `${eventPrefix(kind)}/${entry.recordId}/${entry.eventId}.json`;
    return { entry, key, event: await store.get<Event<Content>>(key) };
  });
  const events: Event<Content>[] = [];
  for (const { entry, key, event } of loaded) {
    // Feed-first appends can be interrupted before writing the source event.
    if (event === null) continue;
    if (
      !eventMatchesPath(kind, event, key) ||
      event.id !== entry.eventId ||
      event.at !== entry.at ||
      event.action !== entry.action
    )
      return null;
    events.push(event);
  }
  return events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

async function stateFromKeys(
  id: string,
  keys: string[],
  store: Store,
  checkpoint?: CheckpointRow,
) {
  const events = await readEventKeys<Content>(
    keys,
    checkpoint?.cutoffAt ?? null,
    store,
  );
  return reduceContent(id, events, checkpoint?.state ?? null);
}

async function fullReplay(kind: Kind, store: Store) {
  const keys = await store.list(`${eventPrefix(kind)}/`);
  const groups = eventKeysById(kind, keys);
  return (
    await mapBounded([...groups], ([id, eventKeys]) =>
      stateFromKeys(id, eventKeys, store),
    )
  ).filter((state): state is RecordState<Content> => !!state);
}

function groupEventsByRecordId(kind: Kind, events: Event<Content>[]) {
  const histories = new Map<string, Event<Content>[]>();
  for (const event of events) {
    const id =
      kind === "articles"
        ? (event.data as Article).slug
        : (event.data as JsonDocument).key;
    const history = histories.get(id) ?? [];
    history.push(event);
    histories.set(id, history);
  }
  return histories;
}

export async function readContentRecord(kind: Kind, id: string, store: Store) {
  identifier.parse(id);
  const checkpoint = await readCheckpointRecord(kind, id, store);
  if (checkpoint) {
    const tail = await readContentFeedTail(
      kind,
      checkpoint.manifest.cutoffAt,
      store,
      id,
    );
    if (tail) return reduceContent(id, tail, checkpoint.row?.state ?? null);
  }
  const keys = (await store.list(`${eventPrefix(kind)}/${id}/`)).filter((key) =>
    key.endsWith(".json"),
  );
  if (!keys.length) return null;
  return stateFromKeys(id, keys, store);
}

export async function readContentRecords(kind: Kind, store: Store) {
  const checkpoint = await readCompleteGeneration(kind, store);
  if (!checkpoint) return fullReplay(kind, store);
  const tail = await readContentFeedTail(
    kind,
    checkpoint.manifest.cutoffAt,
    store,
  );
  if (!tail) return fullReplay(kind, store);

  const histories = groupEventsByRecordId(kind, tail);
  const ids = new Set([...checkpoint.rows.keys(), ...histories.keys()]);
  return [...ids]
    .map((id) =>
      reduceContent(
        id,
        histories.get(id) ?? [],
        checkpoint.rows.get(id)?.state ?? null,
      ),
    )
    .filter((state): state is RecordState<Content> => !!state);
}

/** Returns null until a compact checkpoint exists or if its recent feed tail is invalid. */
export async function readWorkspaceDashboardArticles(
  store: Store,
): Promise<WorkspaceDashboardArticle[] | null> {
  const checkpoint = await readCompleteDashboardGeneration(store);
  if (!checkpoint) return null;
  const tail = await readContentFeedTail(
    "articles",
    checkpoint.manifest.cutoffAt,
    store,
  );
  if (!tail) return null;

  const histories = groupEventsByRecordId("articles", tail);
  const ids = new Set([...checkpoint.rows.keys(), ...histories.keys()]);
  return [...ids]
    .map((id) =>
      reduceDashboardArticle(
        id,
        histories.get(id) ?? [],
        checkpoint.rows.get(id) ?? null,
      ),
    )
    .filter((state): state is WorkspaceDashboardArticle => !!state);
}

export async function contentIndexStatus(
  kind: Kind,
  store: Store,
): Promise<ContentIndexStatus> {
  const checkpoint = await readCompleteGeneration(kind, store);
  if (!checkpoint) {
    const sourceKeys = (await store.list(`${eventPrefix(kind)}/`)).filter(
      (key) => key.endsWith(".json"),
    );
    return {
      indexedThrough: null,
      unindexedEvents: sourceKeys.length,
      valid: true,
    };
  }
  const tail = await readContentFeedTail(
    kind,
    checkpoint.manifest.cutoffAt,
    store,
  );
  return {
    indexedThrough: checkpoint.manifest.cutoffAt,
    unindexedEvents: tail?.length ?? null,
    valid: tail !== null,
  };
}

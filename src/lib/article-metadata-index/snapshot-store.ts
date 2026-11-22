import "server-only";
import { randomUUID } from "node:crypto";
import { mapBounded, type Store } from "../storage";
import type { PublicArticleMetadata } from "../types";
import {
  firstPageSize,
  generationOrphanGraceMs,
  generationsPrefix,
  indexVersion,
  isManifest,
  isPageShard,
  type MetadataIndexManifest,
  makePageShards,
  manifestKey,
  pageShardKey,
  retainedPreviousGenerations,
  shardCount,
  sortedMetadata,
} from "./schema";

export async function readManifest(store: Store) {
  const value = await store.get<unknown>(manifestKey);
  return isManifest(value) ? value : null;
}

export async function removeGeneration(
  store: Store,
  generation: { generation: string; total: number },
) {
  const keys = (["asc", "desc"] as const).flatMap((order) =>
    Array.from({ length: shardCount(generation.total) }, (_, index) =>
      pageShardKey(generation.generation, order, index),
    ),
  );
  await mapBounded(keys, (key) => store.remove(key));
}

export async function writeSnapshot(
  store: Store,
  sourceItems: PublicArticleMetadata[],
  previous: MetadataIndexManifest | null,
) {
  const generation = `${Date.now().toString().padStart(13, "0")}-${randomUUID()}`;
  const asc = sortedMetadata(sourceItems, "asc");
  const desc = sortedMetadata(sourceItems, "desc");
  const shards = [
    ...makePageShards(generation, asc, "asc"),
    ...makePageShards(generation, desc, "desc"),
  ];

  const writeFailures = await mapBounded(shards, async ({ key, value }) => {
    try {
      await store.put(key, value);
      const saved = await store.get<unknown>(key);
      if (
        !isPageShard(
          saved,
          generation,
          value.order,
          value.index,
          value.items.length,
        )
      )
        throw new Error("Public article metadata page shard failed read-back");
      return null;
    } catch (error) {
      return error;
    }
  });
  const failure = writeFailures.find((error) => error !== null);
  if (failure) {
    await removeGeneration(store, {
      generation,
      total: sourceItems.length,
    }).catch(() => undefined);
    throw failure;
  }

  const prior = previous
    ? [
        { generation: previous.generation, total: previous.total },
        ...previous.previousGenerations,
      ]
    : [];
  const retained = prior.slice(0, retainedPreviousGenerations);
  const manifest: MetadataIndexManifest = {
    version: indexVersion,
    generation,
    builtAt: new Date().toISOString(),
    total: sourceItems.length,
    firstPage: {
      asc: asc.slice(0, firstPageSize),
      desc: desc.slice(0, firstPageSize),
    },
    previousGenerations: retained,
  };

  try {
    // This single object is the commit point for total, first page, and shard generation.
    await store.put(manifestKey, manifest);
  } catch (error) {
    await removeGeneration(store, {
      generation,
      total: sourceItems.length,
    }).catch(() => undefined);
    throw error;
  }

  const pruned = prior.slice(retainedPreviousGenerations);
  await Promise.all(
    pruned.map((old) => removeGeneration(store, old).catch(() => undefined)),
  );
  return manifest;
}

export async function pruneOldGenerations(
  store: Store,
  manifest: MetadataIndexManifest,
) {
  const retained = new Set([
    manifest.generation,
    ...manifest.previousGenerations.map((item) => item.generation),
  ]);
  const keys = await store.list(generationsPrefix);
  const oldKeys = keys.filter((key) => {
    const generation = key.slice(generationsPrefix.length).split("/", 1)[0];
    if (!generation || retained.has(generation)) return false;
    const timestamp = Number(generation.slice(0, 13));
    return (
      !Number.isFinite(timestamp) ||
      Date.now() - timestamp > generationOrphanGraceMs
    );
  });
  await mapBounded(oldKeys, (key) => store.remove(key));
}

const metadataWriteQueues = new Map<string, Promise<void>>();
const storeLockIds = new WeakMap<object, string>();
let nextStoreLockId = 0;

function storeLockKey(store: Store) {
  try {
    return store.publicUrl(manifestKey);
  } catch {
    let id = storeLockIds.get(store as object);
    if (!id) {
      id = `store-${++nextStoreLockId}`;
      storeLockIds.set(store as object, id);
    }
    return id;
  }
}

export async function withMetadataWriteLock<T>(
  store: Store,
  task: () => Promise<T>,
) {
  const key = storeLockKey(store);
  const previous = metadataWriteQueues.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  metadataWriteQueues.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (metadataWriteQueues.get(key) === queued)
      metadataWriteQueues.delete(key);
  }
}

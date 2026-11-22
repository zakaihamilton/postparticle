import "server-only";
import { HttpError } from "../config";
import { mapBounded, type Store } from "../storage";
import type {
  PublicArticleMetadata,
  PublicArticleMetadataIndexStatus,
} from "../types";
import {
  firstPageSize,
  isPageShard,
  type MetadataIndexManifest,
  type Order,
  pageShardKey,
  pageShardSize,
} from "./schema";
import { readManifest } from "./snapshot-store";

export async function publicArticleMetadataIndexStatus(
  store: Store,
): Promise<PublicArticleMetadataIndexStatus> {
  const manifest = await readManifest(store);
  return {
    ready: !!manifest,
    total: manifest?.total ?? null,
    builtAt: manifest?.builtAt ?? null,
  };
}

async function readPageShard(
  store: Store,
  manifest: MetadataIndexManifest,
  order: Order,
  index: number,
) {
  const expectedItems = Math.min(
    pageShardSize,
    manifest.total - firstPageSize - index * pageShardSize,
  );
  const value = await store.get<unknown>(
    pageShardKey(manifest.generation, order, index),
  );
  if (!isPageShard(value, manifest.generation, order, index, expectedItems))
    throw new HttpError(
      503,
      "Storage is temporarily unavailable. Please retry.",
    );
  return value.items;
}

export async function listIndexedPublicArticleMetadata(
  query: { order: Order; page: number; pageSize: number },
  store: Store,
): Promise<{
  items: PublicArticleMetadata[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const manifest = await readManifest(store);
  if (!manifest)
    throw new HttpError(
      503,
      "Storage is temporarily unavailable. Please retry.",
    );

  const start = (query.page - 1) * query.pageSize;
  const end = Math.min(start + query.pageSize, manifest.total);
  if (start >= manifest.total)
    return {
      items: [],
      total: manifest.total,
      page: query.page,
      pageSize: query.pageSize,
    };

  const result: PublicArticleMetadata[] = [];
  let cursor = start;
  if (cursor < firstPageSize) {
    const firstEnd = Math.min(end, firstPageSize);
    result.push(...manifest.firstPage[query.order].slice(cursor, firstEnd));
    cursor = firstEnd;
  }
  if (cursor < end) {
    const firstShard = Math.floor((cursor - firstPageSize) / pageShardSize);
    const lastShard = Math.floor((end - 1 - firstPageSize) / pageShardSize);
    const shards = await mapBounded(
      Array.from(
        { length: lastShard - firstShard + 1 },
        (_, index) => firstShard + index,
      ),
      (index) => readPageShard(store, manifest, query.order, index),
    );
    for (let index = firstShard; index <= lastShard; index++) {
      const shardItems = shards[index - firstShard];
      const shardStart = firstPageSize + index * pageShardSize;
      const from = Math.max(cursor, shardStart) - shardStart;
      const to = Math.min(end, shardStart + shardItems.length) - shardStart;
      result.push(...shardItems.slice(from, to));
      cursor = shardStart + to;
    }
  }

  if (result.length !== end - start)
    throw new HttpError(
      503,
      "Storage is temporarily unavailable. Please retry.",
    );
  return {
    items: result,
    total: manifest.total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

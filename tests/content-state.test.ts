import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contentIndexStatus,
  readContentRecord,
  readContentRecords,
  rebuildContentCheckpoints,
} from "@/lib/content-state";
import { append } from "@/lib/events";
import { contentEventFeedKey } from "@/lib/events";
import type { Store } from "@/lib/storage";
import type { Article, Event } from "@/lib/types";

class MemoryStore {
  objects = new Map<string, unknown>();
  listCalls = 0;
  listedPrefixes: string[] = [];
  listMarkers: Array<string | undefined> = [];
  beforeList: ((call: number, prefix: string) => void | Promise<void>) | null =
    null;

  async get<T>(key: string): Promise<T | null> {
    return (this.objects.get(key) as T | undefined) ?? null;
  }

  async put(key: string, data: unknown) {
    this.objects.set(key, structuredClone(data));
  }

  async list(prefix: string, marker?: string) {
    const call = ++this.listCalls;
    this.listedPrefixes.push(prefix);
    this.listMarkers.push(marker);
    await this.beforeList?.(call, prefix);
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix) && (!marker || key > marker))
      .sort();
  }

  resetListings() {
    this.listCalls = 0;
    this.listedPrefixes = [];
    this.listMarkers = [];
  }

  async remove(key: string) {
    this.objects.delete(key);
  }

  asStore() {
    return this as unknown as Store;
  }
}

const baseTime = Date.UTC(2026, 0, 1);
let eventIndex = 0;

function article(slug: string, revision: number): Article {
  return {
    title: `${slug} revision ${revision}`,
    slug,
    excerpt: "Checkpoint fixture",
    body: `Body for ${slug} revision ${revision}`,
    author: "Test",
    tags: [],
    articleDate: "2026-01-01",
    coverMediaId: "",
    seoTitle: "",
    seoDescription: "",
    socialMediaId: "",
  };
}

function makeEvent(
  slug: string,
  revision: number,
  second: number,
  action: "save" | "publish" = "save",
): Event<Article> {
  const at = new Date(baseTime + second * 1000).toISOString();
  const id = `${at.replace(/[:.]/g, "-")}_00000000-0000-4000-8000-${String(++eventIndex).padStart(12, "0")}`;
  return { id, at, actor: "test", action, data: article(slug, revision) };
}

function addEvent(store: MemoryStore, event: Event<Article>) {
  store.objects.set(
    `content/articles/${event.data.slug}/${event.id}.json`,
    structuredClone(event),
  );
}

function addEvents(store: MemoryStore) {
  addEvent(store, makeEvent("alpha", 1, 0));
  addEvent(store, makeEvent("alpha", 2, 1));
  addEvent(store, makeEvent("alpha", 2, 2, "publish"));
  addEvent(store, makeEvent("beta", 1, 0));
  addEvent(store, makeEvent("beta", 1, 3));
}

async function withoutCheckpoints(source: MemoryStore) {
  const copy = new MemoryStore();
  for (const [key, value] of source.objects) {
    if (key.startsWith("content/articles/"))
      copy.objects.set(key, structuredClone(value));
  }
  return readContentRecords("articles", copy.asStore());
}

afterEach(() => {
  eventIndex = 0;
  vi.restoreAllMocks();
});

function checkpointKeys(store: MemoryStore) {
  return [...store.objects.keys()]
    .filter((key) => key.startsWith("checkpoints/content/articles/"))
    .sort();
}

function eventHistory(store: MemoryStore) {
  return [...store.objects.entries()]
    .filter(([key]) => key.startsWith("content/articles/"))
    .sort(([a], [b]) => a.localeCompare(b));
}

describe("content checkpoints", () => {
  it("backfills the feed and reads a snapshot plus only its recent tail", async () => {
    const store = new MemoryStore();
    addEvents(store);
    expect(await contentIndexStatus("articles", store.asStore())).toMatchObject(
      {
        indexedThrough: null,
        unindexedEvents: 5,
        valid: true,
      },
    );

    const built = await rebuildContentCheckpoints("articles", store.asStore());
    expect(built).toMatchObject({ complete: true, indexedEvents: 5 });
    expect(await contentIndexStatus("articles", store.asStore())).toMatchObject(
      {
        unindexedEvents: 0,
        valid: true,
      },
    );
    expect(
      [...store.objects.keys()].filter((key) =>
        key.startsWith("indexes/content/articles/feed/"),
      ),
    ).toHaveLength(5);

    await append(
      store.asStore(),
      "content/articles/alpha",
      "test",
      "save",
      article("alpha", 3),
    );
    const expected = await withoutCheckpoints(store);
    store.resetListings();
    expect(await readContentRecords("articles", store.asStore())).toEqual(
      expected,
    );
    expect(store.listedPrefixes).not.toContain("content/articles/");
    expect(store.listedPrefixes).toContain("indexes/content/articles/feed/");
    expect(store.listMarkers.some(Boolean)).toBe(true);
  });

  it("merges concurrent appends and ignores dangling feed entries", async () => {
    const store = new MemoryStore();
    addEvents(store);
    await rebuildContentCheckpoints("articles", store.asStore());

    await Promise.all([
      append(
        store.asStore(),
        "content/articles/alpha",
        "writer-a",
        "save",
        article("alpha", 3),
      ),
      append(
        store.asStore(),
        "content/articles/beta",
        "writer-b",
        "save",
        article("beta", 3),
      ),
    ]);

    const danglingAt = new Date(Date.now() + 60_000).toISOString();
    const danglingId = `${danglingAt.replace(/[:.]/g, "-")}_00000000-0000-4000-8000-999999999999`;
    const danglingKey = contentEventFeedKey("articles", danglingAt, danglingId);
    store.objects.set(danglingKey, {
      version: 1,
      kind: "articles",
      recordId: "orphan",
      eventId: danglingId,
      at: danglingAt,
      action: "save",
    });

    const expected = await withoutCheckpoints(store);
    store.resetListings();
    expect(await readContentRecords("articles", store.asStore())).toEqual(
      expected,
    );
    expect(store.listedPrefixes).not.toContain("content/articles/");
    expect(store.listedPrefixes).toContain("indexes/content/articles/feed/");
  });

  it("keeps a write racing snapshot publication in the replay tail", async () => {
    vi.spyOn(Date, "now").mockReturnValue(baseTime + 70_000);
    const store = new MemoryStore();
    addEvents(store);
    let appended = false;
    store.beforeList = async (_call, prefix) => {
      if (prefix.startsWith("indexes/content/articles/feed/") && !appended) {
        appended = true;
        await append(
          store.asStore(),
          "content/articles/alpha",
          "racing-writer",
          "save",
          article("alpha", 3),
        );
      }
    };

    const built = await rebuildContentCheckpoints("articles", store.asStore());
    store.beforeList = null;
    expect(built.complete).toBe(true);
    expect(built.unindexedEvents).toBe(1);
    expect(await readContentRecords("articles", store.asStore())).toEqual(
      await withoutCheckpoints(store),
    );
  });

  it("falls back to source replay when a feed entry is invalid", async () => {
    const store = new MemoryStore();
    addEvents(store);
    await rebuildContentCheckpoints("articles", store.asStore());
    const event = await append(
      store.asStore(),
      "content/articles/alpha",
      "test",
      "save",
      article("alpha", 3),
    );
    store.objects.set(contentEventFeedKey("articles", event.at, event.id), {
      version: 999,
      invalid: true,
    });

    const expected = await withoutCheckpoints(store);
    store.resetListings();
    expect(await readContentRecords("articles", store.asStore())).toEqual(
      expected,
    );
    expect(store.listedPrefixes).toContain("content/articles/");
  });

  it("matches full replay after checkpoint edits and records created later", async () => {
    const store = new MemoryStore();
    addEvents(store);

    const fullReplay = await readContentRecords("articles", store.asStore());
    const built = await rebuildContentCheckpoints("articles", store.asStore());
    expect(built.complete).toBe(true);
    expect(built.records).toBe(2);

    await append(
      store.asStore(),
      "content/articles/alpha",
      "test",
      "save",
      article("alpha", 3),
    );
    await append(
      store.asStore(),
      "content/articles/gamma",
      "test",
      "save",
      article("gamma", 1),
    );
    const expected = await withoutCheckpoints(store);
    const checkpointed = await readContentRecords("articles", store.asStore());
    expect(checkpointed).toEqual(expected);
    expect(checkpointed).not.toEqual(fullReplay);
    expect(
      await readContentRecord("articles", "alpha", store.asStore()),
    ).toEqual(expected.find((record) => record.id === "alpha"));
  });

  it("falls back to full replay when a shard is corrupt or missing", async () => {
    const store = new MemoryStore();
    addEvents(store);
    const built = await rebuildContentCheckpoints("articles", store.asStore());
    expect(built.generation).toBeTruthy();
    const prefix = `checkpoints/content/articles/${built.generation}/`;
    const manifest = store.objects.get(`${prefix}manifest.json`) as {
      shards: { key: string }[];
    };
    const shardKey = manifest.shards[0].key;
    const expected = await withoutCheckpoints(store);

    store.objects.set(shardKey, { corrupt: true });
    expect(await readContentRecords("articles", store.asStore())).toEqual(
      expected,
    );

    store.objects.set(shardKey, await store.get(shardKey));
    store.objects.delete(shardKey);
    expect(await readContentRecords("articles", store.asStore())).toEqual(
      expected,
    );
  });

  it("falls back to the previous valid generation when the newest is corrupt", async () => {
    const store = new MemoryStore();
    addEvents(store);
    const first = await rebuildContentCheckpoints("articles", store.asStore());
    await append(
      store.asStore(),
      "content/articles/alpha",
      "test",
      "save",
      article("alpha", 3),
    );
    const newest = await rebuildContentCheckpoints("articles", store.asStore());
    expect(newest.complete).toBe(true);
    expect(newest.generation).toBeTruthy();
    expect(newest.generation).not.toBe(first.generation);

    const manifest = store.objects.get(
      `checkpoints/content/articles/${newest.generation}/manifest.json`,
    ) as { shards: { key: string }[] };
    store.objects.set(manifest.shards[0].key, { corrupt: true });

    expect(await readContentRecords("articles", store.asStore())).toEqual(
      await withoutCheckpoints(store),
    );
  });

  it("retains two newest valid generations and prunes stale orphans without changing event history", async () => {
    let now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const store = new MemoryStore();
    addEvents(store);
    const staleOrphan =
      "checkpoints/content/articles/1577836800000-orphan/shard-00000.json";
    const malformedOrphan =
      "checkpoints/content/articles/unrecognized/shard-00000.json";
    const activeOrphan = `checkpoints/content/articles/${now}-active/shard-00000.json`;
    store.objects.set(staleOrphan, { incomplete: true });
    store.objects.set(malformedOrphan, { incomplete: true });
    store.objects.set(activeOrphan, { inProgress: true });

    const historyBeforeFirstBuild = eventHistory(store);
    const first = await rebuildContentCheckpoints("articles", store.asStore());
    expect(eventHistory(store)).toEqual(historyBeforeFirstBuild);
    addEvent(store, makeEvent("alpha", 3, 4));
    const historyBeforeSecondBuild = eventHistory(store);
    const second = await rebuildContentCheckpoints("articles", store.asStore());
    expect(eventHistory(store)).toEqual(historyBeforeSecondBuild);
    addEvent(store, makeEvent("alpha", 4, 5));
    const historyBeforeThirdBuild = eventHistory(store);
    const third = await rebuildContentCheckpoints("articles", store.asStore());
    expect(eventHistory(store)).toEqual(historyBeforeThirdBuild);

    const manifests = checkpointKeys(store).filter((key) =>
      key.endsWith("/manifest.json"),
    );
    expect(manifests).toHaveLength(2);
    expect(manifests).toContain(
      `checkpoints/content/articles/${second.generation}/manifest.json`,
    );
    expect(manifests).toContain(
      `checkpoints/content/articles/${third.generation}/manifest.json`,
    );
    expect(store.objects.has(staleOrphan)).toBe(false);
    expect(store.objects.has(malformedOrphan)).toBe(false);
    expect(store.objects.has(activeOrphan)).toBe(true);
    expect(checkpointKeys(store)).not.toContain(
      `checkpoints/content/articles/${first.generation}/manifest.json`,
    );
  });

  it("preserves existing checkpoints when repeated source changes prevent a build", async () => {
    const store = new MemoryStore();
    addEvents(store);
    const original = await rebuildContentCheckpoints(
      "articles",
      store.asStore(),
    );
    expect(original.complete).toBe(true);
    const checkpointSnapshot = checkpointKeys(store).map((key) => [
      key,
      structuredClone(store.objects.get(key)),
    ]);

    let sourceListings = 0;
    let injected = 0;
    store.beforeList = (_call, prefix) => {
      if (prefix !== "content/articles/") return;
      sourceListings++;
      if (sourceListings % 3 === 0) {
        injected++;
        addEvent(store, makeEvent("racing", injected, 10 + injected));
      }
    };
    const result = await rebuildContentCheckpoints("articles", store.asStore());
    store.beforeList = null;

    expect(result).toMatchObject({
      complete: false,
      failure: "source-changed",
    });
    expect(injected).toBe(3);
    expect(
      checkpointKeys(store).map((key) => [key, store.objects.get(key)]),
    ).toEqual(checkpointSnapshot);
  });

  it("retries when a stream changes while shards are being written", async () => {
    const store = new MemoryStore();
    addEvent(store, makeEvent("alpha", 1, 0));
    addEvent(store, makeEvent("alpha", 1, 1));
    let sourceListings = 0;
    store.beforeList = (_call, prefix) => {
      if (prefix !== "content/articles/") return;
      sourceListings++;
      if (sourceListings === 3) {
        store.beforeList = null;
        addEvent(store, makeEvent("alpha", 2, 2));
      }
    };

    const result = await rebuildContentCheckpoints("articles", store.asStore());
    expect(result.complete).toBe(true);
    expect(result.retries).toBe(1);
    expect(await readContentRecords("articles", store.asStore())).toEqual(
      await withoutCheckpoints(store),
    );
    const manifests = [...store.objects.keys()].filter(
      (key) =>
        key.startsWith("checkpoints/content/articles/") &&
        key.endsWith("/manifest.json"),
    );
    expect(manifests).toHaveLength(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listIndexedPublicArticleMetadata,
  rebuildPublicArticleMetadataIndex,
} from "@/lib/article-metadata-index";
import { contentAction, saveContent } from "@/lib/content";
import { append } from "@/lib/events";
import type { Store } from "@/lib/storage";
import type { Article } from "@/lib/types";

const manifestKey = "indexes/public-article-metadata/manifest.json";

class MemoryStore {
  readonly objects: Map<string, unknown>;
  readonly id: string;
  listCalls = 0;
  getCalls: string[] = [];
  beforePut?: (key: string, value: unknown) => Promise<void>;

  constructor(objects = new Map<string, unknown>(), id = "default") {
    this.objects = objects;
    this.id = id;
  }

  async get<T>(key: string): Promise<T | null> {
    this.getCalls.push(key);
    return (this.objects.get(key) as T | undefined) ?? null;
  }

  async put(key: string, value: unknown) {
    await this.beforePut?.(key, value);
    this.objects.set(key, structuredClone(value));
  }

  async list(prefix: string, marker?: string) {
    this.listCalls++;
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix) && (!marker || key > marker))
      .sort();
  }

  async remove(key: string) {
    this.objects.delete(key);
  }

  publicUrl(key: string) {
    return `https://storage.example/${this.id}/${key}`;
  }

  asStore() {
    return this as unknown as Store;
  }
}

function article(slug: string, index: number): Article {
  const date = new Date(Date.UTC(2025, 0, 1 + index))
    .toISOString()
    .slice(0, 10);
  return {
    title: `Article ${index}`,
    slug,
    excerpt: `Excerpt ${index}`,
    body: `Private body ${index}`,
    author: "Test Author",
    tags: ["test"],
    articleDate: date,
    coverMediaId: "",
    seoTitle: "",
    seoDescription: "",
    socialMediaId: "",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function addPublishedRecord(
  store: MemoryStore,
  slug: string,
  index: number,
) {
  const data = article(slug, index);
  await append(
    store.asStore(),
    `content/articles/${slug}`,
    "test",
    "save",
    data,
  );
  await append(
    store.asStore(),
    `content/articles/${slug}`,
    "test",
    "publish",
    data,
  );
}

describe("public article metadata index", () => {
  it("fails closed for a missing or old index without replaying source records", async () => {
    const store = new MemoryStore();
    await store.put(manifestKey, {
      version: 1,
      builtAt: new Date().toISOString(),
    });

    await expect(
      listIndexedPublicArticleMetadata(
        { order: "desc", page: 1, pageSize: 12 },
        store.asStore(),
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(store.listCalls).toBe(0);
    expect(store.getCalls).toEqual([manifestKey]);
  });

  it("serves page one from the manifest and reads at most two shards for later pages", async () => {
    const store = new MemoryStore();
    for (let index = 0; index < 400; index++)
      await addPublishedRecord(
        store,
        `article-${String(index).padStart(3, "0")}`,
        index,
      );
    await rebuildPublicArticleMetadataIndex(store.asStore());

    store.listCalls = 0;
    store.getCalls = [];
    const first = await listIndexedPublicArticleMetadata(
      { order: "desc", page: 1, pageSize: 12 },
      store.asStore(),
    );
    expect(first.total).toBe(400);
    expect(first.items.map((item) => item.slug)).toEqual([
      "article-399",
      "article-398",
      "article-397",
      "article-396",
      "article-395",
      "article-394",
      "article-393",
      "article-392",
      "article-391",
      "article-390",
      "article-389",
      "article-388",
    ]);
    expect(store.listCalls).toBe(0);
    expect(store.getCalls).toEqual([manifestKey]);

    store.getCalls = [];
    const later = await listIndexedPublicArticleMetadata(
      { order: "asc", page: 4, pageSize: 90 },
      store.asStore(),
    );
    expect(later.total).toBe(400);
    expect(later.items).toHaveLength(90);
    expect(later.items[0].slug).toBe("article-270");
    expect(later.items.at(-1)?.slug).toBe("article-359");
    expect(store.listCalls).toBe(0);
    expect(store.getCalls).toHaveLength(3);
    expect(store.getCalls[0]).toBe(manifestKey);
  });

  it("recovers cross-instance manifest races without losing either published article", async () => {
    const objects = new Map<string, unknown>();
    const storeA = new MemoryStore(objects, "instance-a");
    const storeB = new MemoryStore(objects, "instance-b");
    await saveContent(
      "articles",
      "test",
      article("alpha", 1),
      storeA.asStore(),
    );
    await saveContent("articles", "test", article("beta", 2), storeB.asStore());
    await rebuildPublicArticleMetadataIndex(storeA.asStore());

    let signalManifestReady!: () => void;
    const manifestReady = new Promise<void>((resolve) => {
      signalManifestReady = resolve;
    });
    let releaseManifest!: () => void;
    const releaseA = new Promise<void>((resolve) => {
      releaseManifest = resolve;
    });
    let delayed = false;
    storeA.beforePut = async (key, value) => {
      if (
        key === manifestKey &&
        !delayed &&
        (value as { total?: number }).total === 1
      ) {
        delayed = true;
        signalManifestReady();
        await releaseA;
      }
    };

    const publishA = contentAction(
      "articles",
      "alpha",
      "test",
      "publish",
      storeA.asStore(),
    );
    await manifestReady;
    await contentAction(
      "articles",
      "beta",
      "test",
      "publish",
      storeB.asStore(),
    );
    releaseManifest();
    await publishA;

    const page = await listIndexedPublicArticleMetadata(
      { order: "asc", page: 1, pageSize: 12 },
      storeA.asStore(),
    );
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.slug)).toEqual(["alpha", "beta"]);

    await contentAction(
      "articles",
      "alpha",
      "test",
      "unpublish",
      storeA.asStore(),
    );
    expect(
      await listIndexedPublicArticleMetadata(
        { order: "asc", page: 1, pageSize: 12 },
        storeA.asStore(),
      ),
    ).toMatchObject({ total: 1, items: [{ slug: "beta" }] });

    await contentAction("articles", "beta", "test", "trash", storeB.asStore());
    expect(
      await listIndexedPublicArticleMetadata(
        { order: "asc", page: 1, pageSize: 12 },
        storeA.asStore(),
      ),
    ).toMatchObject({ total: 0, items: [] });
  });

  it.each(["unpublish", "trash"] as const)(
    "does not let a delayed publish overwrite a newer %s tombstone",
    async (newerAction) => {
      const objects = new Map<string, unknown>();
      const storeA = new MemoryStore(objects, "instance-a");
      const storeB = new MemoryStore(objects, "instance-b");
      const slug = "same-slug";
      const entryKey = `indexes/public-article-metadata/entries/by-slug/${slug}.json`;
      await saveContent("articles", "test", article(slug, 1), storeA.asStore());
      await rebuildPublicArticleMetadataIndex(storeA.asStore());

      let signalEntryWrite!: () => void;
      const entryWriteReady = new Promise<void>((resolve) => {
        signalEntryWrite = resolve;
      });
      let releaseEntryWrite!: () => void;
      const releaseStaleWrite = new Promise<void>((resolve) => {
        releaseEntryWrite = resolve;
      });
      let delayed = false;
      storeA.beforePut = async (key, value) => {
        const entry = value as { metadata?: unknown };
        if (key === entryKey && entry.metadata !== null && !delayed) {
          delayed = true;
          signalEntryWrite();
          await releaseStaleWrite;
        }
      };

      const publishA = contentAction(
        "articles",
        slug,
        "test",
        "publish",
        storeA.asStore(),
      );
      await entryWriteReady;
      await contentAction(
        "articles",
        slug,
        "test",
        newerAction,
        storeB.asStore(),
      );
      releaseEntryWrite();
      await publishA;

      await expect(
        listIndexedPublicArticleMetadata(
          { order: "asc", page: 1, pageSize: 12 },
          storeA.asStore(),
        ),
      ).resolves.toMatchObject({ total: 0, items: [] });
    },
  );

  it("does not let a delayed unpublish tombstone erase a newer publish", async () => {
    const objects = new Map<string, unknown>();
    const storeA = new MemoryStore(objects, "instance-a");
    const storeB = new MemoryStore(objects, "instance-b");
    const slug = "same-slug";
    const entryKey = `indexes/public-article-metadata/entries/by-slug/${slug}.json`;
    await saveContent("articles", "test", article(slug, 1), storeA.asStore());
    await contentAction("articles", slug, "test", "publish", storeA.asStore());

    let signalEntryWrite!: () => void;
    const entryWriteReady = new Promise<void>((resolve) => {
      signalEntryWrite = resolve;
    });
    let releaseEntryWrite!: () => void;
    const releaseStaleWrite = new Promise<void>((resolve) => {
      releaseEntryWrite = resolve;
    });
    let delayed = false;
    storeA.beforePut = async (key, value) => {
      const entry = value as { metadata?: unknown };
      if (key === entryKey && entry.metadata === null && !delayed) {
        delayed = true;
        signalEntryWrite();
        await releaseStaleWrite;
      }
    };

    const unpublishA = contentAction(
      "articles",
      slug,
      "test",
      "unpublish",
      storeA.asStore(),
    );
    await entryWriteReady;
    await contentAction("articles", slug, "test", "publish", storeB.asStore());
    releaseEntryWrite();
    await unpublishA;

    await expect(
      listIndexedPublicArticleMetadata(
        { order: "asc", page: 1, pageSize: 12 },
        storeA.asStore(),
      ),
    ).resolves.toMatchObject({ total: 1, items: [{ slug }] });
  });

  it("fails closed after a failed swap and rebuilds from source events", async () => {
    const store = new MemoryStore();
    await rebuildPublicArticleMetadataIndex(store.asStore());
    await saveContent(
      "articles",
      "test",
      article("recovered", 1),
      store.asStore(),
    );
    let failManifestWrite = true;
    store.beforePut = async (key, value) => {
      if (
        failManifestWrite &&
        key === manifestKey &&
        (value as { total?: number }).total === 1
      ) {
        failManifestWrite = false;
        throw new Error("Injected manifest write failure");
      }
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await contentAction(
      "articles",
      "recovered",
      "test",
      "publish",
      store.asStore(),
    );
    await expect(
      listIndexedPublicArticleMetadata(
        { order: "desc", page: 1, pageSize: 12 },
        store.asStore(),
      ),
    ).rejects.toMatchObject({ status: 503 });

    store.beforePut = undefined;
    await rebuildPublicArticleMetadataIndex(store.asStore());
    await expect(
      listIndexedPublicArticleMetadata(
        { order: "desc", page: 1, pageSize: 12 },
        store.asStore(),
      ),
    ).resolves.toMatchObject({ total: 1, items: [{ slug: "recovered" }] });
  });
});

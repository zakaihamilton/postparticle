import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "@/lib/storage";
import { append } from "@/lib/events";
import {
  articleSchema,
  contentAction,
  getRecord,
  mediaReferences,
  records,
  restoreRevision,
  saveContent,
} from "@/lib/content";
import { listPublicArticles } from "@/lib/public";
import {
  abortUpload,
  deleteMedia,
  finishUpload,
  getMedia,
  publishMedia,
  resolvePublicMedia,
  signPart,
  startUpload,
  writeLocalUpload,
} from "@/lib/media";
let root: string;
let store: LocalStore;
const article = {
  title: "A test story",
  slug: "story",
  excerpt: "A searchable introduction",
  body: "Hello **world**",
  author: "Demo Author",
  tags: ["Ideas", "Ideas"],
  articleDate: "2026-01-15",
  coverMediaId: "",
  seoTitle: "",
  seoDescription: "",
  socialMediaId: "",
};

const pngFixture = () =>
  new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=",
      "base64",
    ),
  );

const jpegFixture = () =>
  Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0,
    8, 1, 1, 0, 0, 0x3f, 0, 0, 0xff, 0xd9,
  ]);

const webpFixture = () =>
  Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 40, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
    0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x56, 0x50, 0x38,
    0x20, 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0,
  ]);

const gifFixture = () =>
  Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0,
    1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b,
  ]);

const mp4Fixture = () =>
  Uint8Array.from([
    0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0,
    0, 0, 9, 0x6d, 0x64, 0x61, 0x74, 0,
  ]);

const webmFixture = () =>
  Uint8Array.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
    0x18, 0x53, 0x80, 0x67, 0x81, 0,
  ]);

const mp4LargePrefix = (size: number) =>
  Uint8Array.from([
    0,
    0,
    0,
    16,
    0x66,
    0x74,
    0x79,
    0x70,
    0x69,
    0x73,
    0x6f,
    0x6d,
    0,
    0,
    2,
    0,
    (size - 16) >>> 24,
    ((size - 16) >>> 16) & 0xff,
    ((size - 16) >>> 8) & 0xff,
    (size - 16) & 0xff,
    0x6d,
    0x64,
    0x61,
    0x74,
  ]);
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "postparticle-unit-"));
  store = new LocalStore("demo", root);
  vi.stubEnv("STORAGE_DRIVER", "local");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("publishing and revisions", () => {
  it("keeps unpublished edits private and restores revisions without changing publication", async () => {
    await saveContent("articles", "editor", article, store);
    const first = (await getRecord("articles", "story", store))!;
    expect(await listPublicArticles("demo", {}, store)).toMatchObject({
      total: 0,
    });
    await contentAction("articles", "story", "editor", "publish", store);
    await saveContent(
      "articles",
      "editor",
      { ...article, title: "Private edit" },
      store,
    );
    expect((await listPublicArticles("demo", {}, store)).items[0].title).toBe(
      article.title,
    );
    await restoreRevision("articles", "story", "editor", first.revision, store);
    expect((await getRecord("articles", "story", store))?.draft.title).toBe(
      article.title,
    );
    await contentAction("articles", "story", "editor", "unpublish", store);
    expect((await listPublicArticles("demo", {}, store)).total).toBe(0);
  });
  it("keeps malformed media literals readable in published articles and JSON", async () => {
    const invalid = [
      `media:${"a".repeat(36)}`,
      "media:550e8400-e29b-41d4-a716-446655440000extra",
      "media:not-an-id",
    ];
    const draft = { ...article, body: invalid.join("\n") };
    expect(mediaReferences(draft, "articles")).toEqual([]);
    await saveContent("articles", "a", draft, store);
    await publishMedia(draft, store, "articles");
    await contentAction("articles", "story", "a", "publish", store);
    expect((await listPublicArticles("demo", {}, store)).items[0].body).toBe(
      draft.body,
    );
    expect(resolvePublicMedia({ nested: invalid }, store)).toEqual({
      nested: invalid,
    });
  });
  it("publishes arbitrary JSON field names without treating them as article fields", async () => {
    const document = {
      key: "settings",
      title: "Settings",
      tags: [],
      value: {
        coverMediaId: "hero-image",
        nested: {
          socialMediaId: randomUUID(),
          slug: "not-an-article",
          body: "text",
        },
      },
    };
    await saveContent("documents", "a", document, store);
    expect(mediaReferences(document, "documents")).toEqual([]);
    await publishMedia(document, store, "documents");
    await contentAction("documents", "settings", "a", "publish", store);
    expect(
      resolvePublicMedia(
        (await getRecord("documents", "settings", store))?.published,
        store,
      ),
    ).toEqual(document);
    const cover = randomUUID();
    expect(
      mediaReferences({ ...article, coverMediaId: cover }, "articles"),
    ).toEqual([cover]);
    await expect(
      publishMedia({ ...article, coverMediaId: cover }, store, "articles"),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("retains racing saves and resolves them independently of listing order", async () => {
    await Promise.all([
      saveContent("articles", "a", article, store),
      saveContent("articles", "b", { ...article, title: "Other" }, store),
    ]);
    const before = await getRecord("articles", "story", store);
    const list = store.list.bind(store);
    vi.spyOn(store, "list").mockImplementation(async (prefix) =>
      (await list(prefix)).reverse(),
    );
    expect(await getRecord("articles", "story", store)).toEqual(before);
    expect((await store.list("content/articles/story/")).length).toBe(2);
  });
  it("trash hides publication; restore keeps it unpublished", async () => {
    await saveContent("articles", "a", article, store);
    await contentAction("articles", "story", "a", "publish", store);
    await contentAction("articles", "story", "a", "trash", store);
    expect((await listPublicArticles("demo", {}, store)).total).toBe(0);
    await contentAction("articles", "story", "a", "restore", store);
    expect((await getRecord("articles", "story", store))?.published).toBeNull();
  });
  it("filters tags, searches body, sorts article dates and paginates stably", async () => {
    for (const [slug, date] of [
      ["older", "2025-01-01"],
      ["newer", "2026-01-01"],
      ["same-date", "2026-01-01"],
    ]) {
      await saveContent(
        "articles",
        "a",
        { ...article, slug, articleDate: date },
        store,
      );
      await contentAction("articles", slug, "a", "publish", store);
    }
    const page = await listPublicArticles(
      "demo",
      { tag: "IDEAS", q: "world", pageSize: "1", page: "2" },
      store,
    );
    expect(page.total).toBe(3);
    expect(page.items[0].slug).toBe("same-date");
    expect(
      (await listPublicArticles("demo", { order: "asc" }, store)).items[0].slug,
    ).toBe("older");
    expect(
      (await listPublicArticles("demo", { tag: "absent" }, store)).total,
    ).toBe(0);
    expect(page.items[0]).not.toHaveProperty("coverMediaId");
  });
  it("validates calendar dates and supports schemaless JSON", async () => {
    expect(
      articleSchema.safeParse({ ...article, articleDate: "2026-02-31" })
        .success,
    ).toBe(false);
    await saveContent(
      "documents",
      "a",
      {
        key: "banner",
        title: "Banner",
        tags: [],
        value: { arbitrary: [1, true, null, { nested: "hello" }] },
      },
      store,
    );
    expect((await records("documents", store))[0].draft).toHaveProperty(
      "value.arbitrary",
    );
    await expect(
      saveContent(
        "documents",
        "a",
        { key: "../bad", title: "Bad", tags: [], value: {} },
        store,
      ),
    ).rejects.toThrow();
  });
});
describe("media lifecycle", () => {
  it("rejects incomplete multipart uploads, finalizes complete uploads, and aborts interruptions", async () => {
    vi.stubEnv("STORAGE_DRIVER", "spaces");
    vi.spyOn(store, "multipartStart").mockResolvedValue("multipart-test");
    vi.spyOn(store, "multipartPart").mockResolvedValue(
      "https://uploads.example/part",
    );
    const complete = vi.spyOn(store, "multipartComplete").mockResolvedValue();
    const abort = vi.spyOn(store, "multipartAbort").mockResolvedValue();
    const input = {
      filename: "film.mp4",
      contentType: "video/mp4",
      size: 24 * 1024 * 1024,
    };
    const upload = await startUpload("a", input, store, "demo");
    expect(upload.multipart).toBe(true);
    await expect(signPart(upload.id, 4, store)).rejects.toMatchObject({
      status: 400,
    });
    expect(await signPart(upload.id, 1, store)).toBe(
      "https://uploads.example/part",
    );
    await expect(
      finishUpload("a", upload.id, [{ PartNumber: 1, ETag: "one" }], store),
    ).rejects.toMatchObject({ status: 400 });
    expect(complete).not.toHaveBeenCalled();
    vi.spyOn(store, "head").mockResolvedValue({
      size: input.size,
      contentType: input.contentType,
    });
    vi.spyOn(store, "readPrefix").mockResolvedValue(
      Buffer.from(mp4LargePrefix(input.size)),
    );
    vi.spyOn(store, "readSuffix").mockResolvedValue(Buffer.from([0]));
    vi.spyOn(store, "copyPrivate").mockResolvedValue();
    await finishUpload(
      "a",
      upload.id,
      [1, 2, 3].map((part) => ({ PartNumber: part, ETag: `etag-${part}` })),
      store,
    );
    expect((await getMedia(upload.id, store))?.ready).toBe(true);
    const interrupted = await startUpload("a", input, store, "demo");
    await abortUpload(interrupted.id, store);
    expect(abort).toHaveBeenCalledOnce();
    expect(await store.get(`uploads/${interrupted.id}.json`)).toBeNull();
  });
  it("seals private uploads, publishes copies and blocks referenced deletion", async () => {
    const pngSignature = pngFixture();
    const upload = await startUpload(
      "editor",
      {
        filename: "demo.png",
        contentType: "image/png",
        size: pngSignature.length,
      },
      store,
      "demo",
    );
    await writeLocalUpload(upload.id, pngSignature, store);
    await finishUpload("editor", upload.id, [], store);
    expect((await getMedia(upload.id, store))?.ready).toBe(true);
    const draft = {
      ...article,
      coverMediaId: upload.id.toUpperCase(),
      body: `![Demo](media:${upload.id})`,
    };
    expect(mediaReferences(draft, "articles")).toEqual([upload.id]);
    await saveContent("articles", "editor", draft, store);
    await expect(deleteMedia("editor", upload.id, store)).rejects.toMatchObject(
      { status: 409 },
    );
    await publishMedia(draft, store, "articles");
    await contentAction("articles", "story", "editor", "publish", store);
    expect(
      (await listPublicArticles("demo", {}, store)).items[0].coverUrl,
    ).toContain(`/public/media/${upload.id}/asset`);
    expect((await store.head(`public/media/${upload.id}/asset`)).size).toBe(
      pngSignature.length,
    );
    expect(
      resolvePublicMedia({ image: `media:${upload.id}` }, store).image,
    ).toContain("/public/media/");
    expect(await store.get(`uploads/${upload.id}.json`)).toBeNull();
  });
  it.each(["originals", "public/media"])(
    "retries deletion cleanup when removing the %s object fails",
    async (failedPrefix) => {
      const id = randomUUID();
      const objectKeys = [`originals/${id}/asset`, `public/media/${id}/asset`];
      await append(store, `media/${id}`, "editor", "upload", {
        id,
        filename: "delete-me.png",
        contentType: "image/png",
        size: 1,
        alt: "",
        caption: "",
        metadata: {},
        createdAt: new Date().toISOString(),
        ready: true,
        deleted: false,
      });
      await Promise.all(
        objectKeys.map((key) =>
          store.writeBytes(key, new Uint8Array([1]), "image/png"),
        ),
      );

      const failedKey = `${failedPrefix}/${id}/asset`;
      const removeObject = store.remove.bind(store);
      let failOnce = true;
      const remove = vi
        .spyOn(store, "remove")
        .mockImplementation(async (key) => {
          if (key === failedKey && failOnce) {
            failOnce = false;
            throw new Error("temporary storage failure");
          }
          await removeObject(key);
        });

      await expect(deleteMedia("editor", id, store)).rejects.toThrow(
        "temporary storage failure",
      );
      expect((await getMedia(id, store))?.deleted).toBe(true);
      expect(remove).toHaveBeenCalledTimes(2);

      await expect(deleteMedia("editor", id, store)).resolves.toBeUndefined();
      await expect(deleteMedia("editor", id, store)).resolves.toBeUndefined();
      expect(remove).toHaveBeenCalledTimes(6);
      expect(await store.list(`media/${id}/`)).toHaveLength(2);
      await expect(store.head(objectKeys[0])).rejects.toMatchObject({
        status: 404,
      });
      await expect(store.head(objectKeys[1])).rejects.toMatchObject({
        status: 404,
      });
    },
  );
  it("rejects invalid file types, mismatched sizes, and unavailable references", async () => {
    await expect(
      startUpload(
        "a",
        { filename: "bad.svg", contentType: "image/svg+xml", size: 10 },
        store,
        "demo",
      ),
    ).rejects.toThrow();
    const upload = await startUpload(
      "a",
      { filename: "a.png", contentType: "image/png", size: 3 },
      store,
      "demo",
    );
    await expect(
      writeLocalUpload(upload.id, new Uint8Array([1]), store),
    ).rejects.toMatchObject({ status: 400 });
    await store.writeBytes(
      `incoming/${upload.id}/asset`,
      new Uint8Array([1]),
      "image/png",
    );
    await expect(finishUpload("a", upload.id, [], store)).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(
      publishMedia({ image: `media:${randomUUID()}` }, store),
    ).rejects.toMatchObject({ status: 400 });
    await abortUpload(upload.id, store);
    expect(await store.get(`uploads/${upload.id}.json`)).toBeNull();
  });
  it("accepts the six supported signatures using bounded prefix reads", async () => {
    const fixtures = [
      ["image/jpeg", jpegFixture()],
      ["image/png", pngFixture()],
      ["image/webp", webpFixture()],
      ["image/gif", gifFixture()],
      ["video/mp4", mp4Fixture()],
      ["video/webm", webmFixture()],
    ] as const;

    for (const [index, [contentType, bytes]] of fixtures.entries()) {
      const upload = await startUpload(
        "editor",
        {
          filename: `fixture-${index}`,
          contentType,
          size: bytes.length,
        },
        store,
        "demo",
      );
      await store.writeBytes(`incoming/${upload.id}/asset`, bytes, contentType);
      try {
        await finishUpload("editor", upload.id, [], store);
      } catch (error) {
        throw new Error(`${contentType}: ${(error as Error).message}`);
      }
      expect((await getMedia(upload.id, store))?.ready).toBe(true);
    }
  });
  it("rejects short or mismatched signatures and removes staged data and tickets", async () => {
    const fixtures = [
      {
        contentType: "image/png",
        storedContentType: "image/png",
        bytes: new TextEncoder().encode("nope"),
      },
      {
        contentType: "image/png",
        storedContentType: "image/png",
        bytes: new TextEncoder().encode("GIF89a"),
      },
      {
        contentType: "image/png",
        storedContentType: "video/mp4",
        bytes: Uint8Array.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
      },
      {
        contentType: "video/mp4",
        storedContentType: "video/mp4",
        bytes: Uint8Array.from([
          0x00, 0x00, 0x00, 0x08, 0x66, 0x74, 0x79, 0x70,
        ]),
      },
    ] as const;

    for (const [index, fixture] of fixtures.entries()) {
      const upload = await startUpload(
        "editor",
        {
          filename: `invalid-${index}.png`,
          contentType: fixture.contentType,
          size: fixture.bytes.length,
        },
        store,
        "demo",
      );
      await store.writeBytes(
        `incoming/${upload.id}/asset`,
        fixture.bytes,
        fixture.storedContentType,
      );
      await expect(
        finishUpload("editor", upload.id, [], store),
      ).rejects.toMatchObject({ status: 415 });
      expect(await store.get(`uploads/${upload.id}.json`)).toBeNull();
      expect(await store.list(`incoming/${upload.id}/`)).toEqual([]);
      expect(await getMedia(upload.id, store)).toBeNull();
    }
  });
  it("rejects truncated containers and invalid image or video metadata", async () => {
    const truncatedPng = pngFixture().slice(0, -12);
    const metadataOnlyWebp = webpFixture().slice(0, 30);
    metadataOnlyWebp[4] = 22;
    const zeroDimensionPng = pngFixture();
    zeroDimensionPng.fill(0, 16, 20);
    const oversizedMp4Box = mp4Fixture();
    oversizedMp4Box.set([0, 0, 1, 0], 16);
    const invalidWebmDocType = webmFixture();
    invalidWebmDocType.set(new TextEncoder().encode("matr"), 8);
    const fixtures = [
      ["image/png", truncatedPng],
      ["image/webp", metadataOnlyWebp],
      ["image/png", zeroDimensionPng],
      ["video/mp4", oversizedMp4Box],
      ["video/webm", invalidWebmDocType],
    ] as const;

    for (const [index, [contentType, bytes]] of fixtures.entries()) {
      const upload = await startUpload(
        "editor",
        {
          filename: `invalid-metadata-${index}`,
          contentType,
          size: bytes.length,
        },
        store,
        "demo",
      );
      await store.writeBytes(`incoming/${upload.id}/asset`, bytes, contentType);
      await expect(
        finishUpload("editor", upload.id, [], store),
      ).rejects.toMatchObject({
        status: 415,
      });
      expect(await store.get(`uploads/${upload.id}.json`)).toBeNull();
      expect(await store.list(`incoming/${upload.id}/`)).toEqual([]);
    }
  });
  it("propagates storage errors without pretending to have saved", async () => {
    vi.spyOn(store, "put").mockRejectedValue(new Error("Unavailable"));
    await expect(
      append(store, "content/articles/story", "a", "save", article),
    ).rejects.toThrow("Unavailable");
  });
});

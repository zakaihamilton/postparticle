import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
import {
  authorize,
  createSession,
  getUser,
  listUsers,
  hashPassword,
  membership,
  resetUserPassword,
  saveUser,
  sessionUser,
  setMembership,
  verifyPassword,
} from "@/lib/auth";
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
let control: LocalStore;
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
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "postparticle-unit-"));
  store = new LocalStore("demo", root);
  control = new LocalStore("control", root);
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
describe("accounts, sessions, and isolation", () => {
  it("loads email accounts and memberships using normalized names", async () => {
    const emailUser = {
      username: "Editor+News@Example.COM",
      passwordHash: await hashPassword("test-password-long"),
      platformAdmin: false,
      disabled: false,
      sessionVersion: randomUUID(),
    };
    await saveUser("admin", emailUser, control);
    await setMembership("admin", emailUser.username, "demo", "editor", control);
    expect((await listUsers(control))[0].username).toBe(
      "editor+news@example.com",
    );
    expect((await getUser("EDITOR+NEWS@EXAMPLE.COM", control))?.username).toBe(
      "editor+news@example.com",
    );
    expect(await membership("EDITOR+NEWS@EXAMPLE.COM", "demo", control)).toBe(
      "editor",
    );
    const token = await createSession(emailUser, control);
    expect(await sessionUser(token, control)).toMatchObject({
      username: "editor+news@example.com",
    });
    await resetUserPassword(
      "operator-recovery",
      emailUser.username,
      "new-password-long",
      control,
    );
    expect(await sessionUser(token, control)).toBeNull();
    const updated = (await getUser(emailUser.username, control))!;
    expect(
      await verifyPassword("new-password-long", updated.passwordHash),
    ).toBe(true);
    expect(
      await verifyPassword("test-password-long", updated.passwordHash),
    ).toBe(false);
    expect(await membership(emailUser.username, "demo", control)).toBe(
      "editor",
    );
    expect(updated.platformAdmin).toBe(false);
    expect(updated.disabled).toBe(false);
    await expect(
      resetUserPassword(
        "operator-recovery",
        emailUser.username,
        "short",
        control,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  async function user() {
    return {
      username: "editor",
      passwordHash: await hashPassword("test-password-long"),
      platformAdmin: false,
      disabled: false,
      sessionVersion: randomUUID(),
    };
  }
  it("hashes and verifies passwords and revokes sessions on version change", async () => {
    const u = await user();
    expect(await verifyPassword("wrong", u.passwordHash)).toBe(false);
    expect(await verifyPassword("test-password-long", u.passwordHash)).toBe(
      true,
    );
    await saveUser("admin", u, control);
    const token = await createSession(u, control);
    expect(await sessionUser(token, control)).toMatchObject({
      username: "editor",
    });
    await saveUser("admin", { ...u, sessionVersion: randomUUID() }, control);
    expect(await sessionUser(token, control)).toBeNull();
    expect(await sessionUser("invalid", control)).toBeNull();
  });
  it("rejects viewers' writes, unauthorized projects, and disabled accounts", async () => {
    const u = await user();
    await saveUser("admin", u, control);
    await setMembership("admin", "editor", "demo", "viewer", control);
    expect(await authorize(u, "demo", false, false, control)).toBe("viewer");
    await expect(
      authorize(u, "demo", true, false, control),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authorize(
        { username: "outsider", platformAdmin: false },
        "demo",
        false,
        false,
        control,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const token = await createSession(u, control);
    await saveUser("admin", { ...u, disabled: true }, control);
    expect(await sessionUser(token, control)).toBeNull();
    expect((await getUser("editor", control))?.disabled).toBe(true);
  });
  it("rejects expired sessions and keeps scopes isolated", async () => {
    vi.useFakeTimers();
    try {
      const u = await user();
      await saveUser("admin", u, control);
      const token = await createSession(u, control);
      vi.advanceTimersByTime(9 * 60 * 60 * 1000);
      expect(await sessionUser(token, control)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    await store.put("private/a.json", { value: 1 });
    expect(await control.get("private/a.json")).toBeNull();
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
      Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
        0x00, 0x00, 0x02, 0x00,
      ]),
    );
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
    const pngSignature = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
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
      ["image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0x00])],
      [
        "image/png",
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ],
      ["image/webp", new TextEncoder().encode("RIFFxxxxWEBPVP8 ")],
      ["image/gif", new TextEncoder().encode("GIF89a")],
      [
        "video/mp4",
        Uint8Array.from([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f,
          0x6d, 0x00, 0x00, 0x02, 0x00,
        ]),
      ],
      ["video/webm", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])],
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
      await finishUpload("editor", upload.id, [], store);
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
  it("propagates storage errors without pretending to have saved", async () => {
    vi.spyOn(store, "put").mockRejectedValue(new Error("Unavailable"));
    await expect(
      append(store, "content/articles/story", "a", "save", article),
    ).rejects.toThrow("Unavailable");
  });
});

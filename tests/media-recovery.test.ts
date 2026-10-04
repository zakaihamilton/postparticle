import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "@/lib/storage";
import { events } from "@/lib/events";
import {
  abortUpload,
  editMedia,
  finishUpload,
  getMedia,
  startUpload,
} from "@/lib/media";
let root: string;
let store: LocalStore;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "postparticle-recovery-"));
  store = new LocalStore("demo", root);
  vi.stubEnv("STORAGE_DRIVER", "spaces");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
async function multipart() {
  const input = {
    filename: "film.mp4",
    contentType: "video/mp4",
    size: 24 * 1024 * 1024,
  };
  vi.spyOn(store, "multipartStart").mockResolvedValue("fixture-upload");
  let completed = false;
  const complete = vi
    .spyOn(store, "multipartComplete")
    .mockImplementation(async (key?: string) => {
      if (!key) throw new Error("Missing fixture key");
      if (completed)
        throw Object.assign(new Error("Already completed"), {
          name: "NoSuchUpload",
        });
      await store.writeBytes(key, new Uint8Array([1, 2, 3]), input.contentType);
      completed = true;
    });
  const head = store.head.bind(store);
  vi.spyOn(store, "head").mockImplementation(async (key) => {
    const result = await head(key);
    return key.startsWith("incoming/")
      ? { ...result, size: input.size }
      : result;
  });
  const { id } = await startUpload("editor", input, store, "demo");
  return {
    id,
    complete,
    parts: [1, 2, 3].map((PartNumber) => ({
      PartNumber,
      ETag: `part-${PartNumber}`,
    })),
  };
}
it("resumes sealing after a copy failure and makes successful completion repeatable", async () => {
  const { id, complete, parts } = await multipart();
  const copy = vi
    .spyOn(store, "copyPrivate")
    .mockRejectedValueOnce(new Error("Copy unavailable"));
  await expect(finishUpload("editor", id, parts, store)).rejects.toThrow(
    "Copy unavailable",
  );
  expect(await store.get(`uploads/${id}.json`)).toMatchObject({
    completed: true,
  });
  await finishUpload("editor", id, parts, store);
  await finishUpload("editor", id, parts, store);
  expect(complete).toHaveBeenCalledOnce();
  expect(copy).toHaveBeenCalledTimes(2);
  expect((await getMedia(id, store))?.ready).toBe(true);
  expect(await store.get(`uploads/${id}.json`)).toBeNull();
  expect(await events(store, `media/${id}`)).toHaveLength(1);
});
it("recovers when the completion checkpoint fails after the multipart upload committed", async () => {
  const { id, complete, parts } = await multipart();
  vi.spyOn(store, "put").mockRejectedValueOnce(
    new Error("Checkpoint unavailable"),
  );
  await expect(finishUpload("editor", id, parts, store)).rejects.toThrow(
    "Checkpoint unavailable",
  );
  await finishUpload("editor", id, parts, store);
  expect(complete).toHaveBeenCalledTimes(2);
  expect((await getMedia(id, store))?.ready).toBe(true);
});
it("resumes after a HEAD failure without completing multipart a second time", async () => {
  const { id, complete, parts } = await multipart();
  vi.mocked(store.head).mockRejectedValueOnce(new Error("HEAD unavailable"));
  await expect(finishUpload("editor", id, parts, store)).rejects.toThrow(
    "HEAD unavailable",
  );
  await finishUpload("editor", id, parts, store);
  expect(complete).toHaveBeenCalledOnce();
  expect((await getMedia(id, store))?.ready).toBe(true);
});
it("retries cleanup without resealing or overwriting metadata after the asset was committed", async () => {
  const { id, complete, parts } = await multipart();
  const copy = vi.spyOn(store, "copyPrivate");
  vi.spyOn(store, "remove").mockRejectedValueOnce(
    new Error("Cleanup unavailable"),
  );
  await expect(finishUpload("editor", id, parts, store)).rejects.toThrow(
    "Cleanup unavailable",
  );
  await editMedia(
    "editor",
    id,
    { alt: "Saved alt", caption: "Saved caption", metadata: { note: true } },
    store,
  );
  await finishUpload("editor", id, parts, store);
  expect(copy).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledOnce();
  expect((await getMedia(id, store))?.caption).toBe("Saved caption");
  expect(await store.get(`uploads/${id}.json`)).toBeNull();
});
it("cleans up an already-completed upload even if its completion checkpoint was lost", async () => {
  const { id, parts } = await multipart();
  vi.spyOn(store, "put").mockRejectedValueOnce(
    new Error("Checkpoint unavailable"),
  );
  await expect(finishUpload("editor", id, parts, store)).rejects.toThrow();
  vi.spyOn(store, "multipartAbort").mockRejectedValue(
    Object.assign(new Error("Already completed"), { name: "NoSuchUpload" }),
  );
  await abortUpload(id, store);
  expect(await store.get(`uploads/${id}.json`)).toBeNull();
  expect(await store.list("incoming/")).toEqual([]);
});

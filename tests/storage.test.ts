import { describe, expect, it, vi, afterEach } from "vitest";
import {
  S3Client,
  ListObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { checkKey, SpacesStore } from "@/lib/storage";
afterEach(() => vi.unstubAllEnvs());
function fake() {
  vi.stubEnv("TEST_SPACES_ENDPOINT", "https://nyc3.digitaloceanspaces.com");
  vi.stubEnv("TEST_SPACES_BUCKET", "test-bucket");
  const send = vi.fn();
  return {
    send,
    store: new SpacesStore("TEST", { send } as unknown as S3Client),
  };
}
describe("Spaces adapter", () => {
  it("fully traverses legacy marker pages and falls back to the last key", async () => {
    const { store, send } = fake();
    send
      .mockResolvedValueOnce({
        IsTruncated: true,
        Contents: [{ Key: "events/1" }, { Key: "events/2" }],
      })
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextMarker: "events/3",
        Contents: [{ Key: "events/3" }],
      })
      .mockResolvedValueOnce({
        IsTruncated: false,
        Contents: [{ Key: "events/4" }],
      });
    expect(await store.list("events/")).toEqual([
      "events/1",
      "events/2",
      "events/3",
      "events/4",
    ]);
    expect(send.mock.calls[1][0]).toBeInstanceOf(ListObjectsCommand);
    expect(send.mock.calls[1][0].input.Marker).toBe("events/2");
    expect(send.mock.calls[2][0].input.Marker).toBe("events/3");
  });
  it("fails instead of looping on broken pagination", async () => {
    const { store, send } = fake();
    send.mockResolvedValue({ IsTruncated: true, Contents: [] });
    await expect(store.list("events/")).rejects.toThrow("did not advance");
  });
  it("uses private ACLs and differentiates missing data from outages", async () => {
    const { store, send } = fake();
    send.mockResolvedValueOnce({});
    await store.put("account/a.json", { data: 1 });
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input.ACL).toBe("private");
    send.mockRejectedValueOnce({ name: "NoSuchKey" });
    expect(await store.get("account/missing.json")).toBeNull();
    send.mockRejectedValueOnce(new Error("network"));
    await expect(store.get("account/a.json")).rejects.toThrow("network");
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
  });
  it("reads only a requested object prefix with an S3 range request", async () => {
    const { store, send } = fake();
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => bytes },
    });
    expect(await store.readPrefix("incoming/asset", 8)).toEqual(bytes);
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[0][0].input.Range).toBe("bytes=0-7");
  });
  it("copies private and public assets with explicit ACLs", async () => {
    const { store, send } = fake();
    send.mockResolvedValue({});
    await store.copyPrivate("incoming/asset", "originals/asset", "image/png");
    await store.copyPublic("originals/asset", "public/asset", "image/png");
    expect(send.mock.calls[0][0]).toBeInstanceOf(CopyObjectCommand);
    expect(send.mock.calls.map((call) => call[0].input.ACL)).toEqual([
      "private",
      "public-read",
    ]);
  });
  it("passes multipart completion and abort to the origin", async () => {
    const { store, send } = fake();
    send.mockResolvedValue({});
    await store.multipartComplete("incoming/asset", "upload-1", [
      { PartNumber: 1, ETag: "etag" },
    ]);
    await store.multipartAbort("incoming/asset", "upload-1");
    expect(send.mock.calls[0][0]).toBeInstanceOf(
      CompleteMultipartUploadCommand,
    );
    expect(send.mock.calls[1][0]).toBeInstanceOf(AbortMultipartUploadCommand);
  });
  it("rejects path traversal", () => {
    for (const key of ["../secret", "/root", "a/../b", "a\\b", "a//b"])
      expect(() => checkKey(key)).toThrow();
  });
});

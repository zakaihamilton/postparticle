import "server-only";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { HttpError } from "../config";
import { checkKey, type Store } from "./types";

export class LocalStore implements Store {
  constructor(
    private scope: string,
    private root = process.env.LOCAL_STORAGE_PATH ||
      path.resolve(".local-storage"),
  ) {
    checkKey(scope);
  }
  private file(key: string) {
    return path.join(this.root, this.scope, checkKey(key));
  }
  async get<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async put(key: string, data: unknown) {
    await this.writeBytes(
      key,
      Buffer.from(JSON.stringify(data)),
      "application/json",
    );
  }
  async list(prefix: string, marker?: string) {
    const base = path.join(this.root, this.scope);
    const out: string[] = [];
    async function walk(dir: string) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else {
          const key = path.relative(base, full).split(path.sep).join("/");
          if (
            key.startsWith(prefix) &&
            !key.endsWith(".meta") &&
            !key.includes(".tmp-")
          )
            out.push(key);
        }
      }
    }
    await walk(base);
    return out.filter((key) => !marker || key > marker).sort();
  }
  async remove(key: string) {
    const file = this.file(key);
    for (const target of [file, `${file}.meta`])
      await unlink(target).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      });
  }
  async bytes(key: string) {
    return readFile(this.file(key));
  }
  async readStream(key: string) {
    return createReadStream(this.file(key));
  }
  async readPrefix(key: string, length: number) {
    if (!Number.isInteger(length) || length < 1 || length > 64 * 1024)
      throw new Error("Invalid storage prefix length");
    const file = await open(this.file(key), "r");
    try {
      const prefix = Buffer.alloc(length);
      const { bytesRead } = await file.read(prefix, 0, length, 0);
      return prefix.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }
  async readSuffix(key: string, length: number, _size?: number) {
    void _size;
    if (!Number.isInteger(length) || length < 1 || length > 64 * 1024)
      throw new Error("Invalid storage suffix length");
    const file = await open(this.file(key), "r");
    try {
      const size = (await file.stat()).size;
      const suffix = Buffer.alloc(Math.min(length, size));
      const { bytesRead } = await file.read(
        suffix,
        0,
        suffix.length,
        Math.max(0, size - length),
      );
      return suffix.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }
  async writeBytes(
    key: string,
    data: Uint8Array,
    contentType: string,
    cacheControl?: string,
  ) {
    void cacheControl;
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp-${randomUUID()}`;
    await writeFile(temp, data);
    await rename(temp, file);
    await writeFile(
      `${file}.meta`,
      JSON.stringify({ size: data.length, contentType }),
    );
  }
  async head(key: string) {
    const file = this.file(key);
    try {
      await stat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new HttpError(404, "Stored object not found");
      throw error;
    }
    return JSON.parse(await readFile(`${file}.meta`, "utf8")) as {
      size: number;
      contentType: string;
    };
  }
  async copyPublic(from: string, to: string, contentType: string) {
    await this.writeBytes(to, await this.bytes(from), contentType);
  }
  async copyPrivate(from: string, to: string, contentType: string) {
    await this.writeBytes(to, await this.bytes(from), contentType);
  }
  async signGet(key: string) {
    return `/api/local-media/${this.scope}/${checkKey(key)}`;
  }
  async signPut() {
    throw new Error("Local uploads use the authenticated byte endpoint");
    return "";
  }
  async multipartStart() {
    throw new Error("Use single uploads with the local adapter");
    return "";
  }
  async multipartPart() {
    throw new Error("Use single uploads with the local adapter");
    return "";
  }
  async multipartComplete() {
    throw new Error("Use single uploads with the local adapter");
  }
  async multipartAbort() {
    /* No local multipart uploads. */
  }
  async purgePrefixBatch(prefix: string) {
    const keys = (await this.list(prefix)).slice(0, 1000);
    for (const key of keys) await this.remove(key);
    return { done: keys.length === 0, deleted: keys.length };
  }
  publicUrl(key: string) {
    return `/api/local-media/${this.scope}/${checkKey(key)}`;
  }
}

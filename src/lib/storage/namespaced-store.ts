import "server-only";
import { checkKey, type Store } from "./types";

export class NamespacedStore implements Store {
  private readonly objectPrefix: string;

  constructor(
    private readonly store: Store,
    namespace: string,
  ) {
    this.objectPrefix = `${checkKey(namespace)}/`;
  }

  private key(key: string) {
    return `${this.objectPrefix}${checkKey(key)}`;
  }

  async get<T>(key: string) {
    return this.store.get<T>(this.key(key));
  }

  async put(key: string, data: unknown) {
    await this.store.put(this.key(key), data);
  }

  async list(prefix: string, marker?: string) {
    const checkedPrefix = checkKey(prefix.replace(/\/$/, ""));
    const trailingSlash = prefix.endsWith("/") ? "/" : "";
    const fullPrefix = `${this.objectPrefix}${checkedPrefix}${trailingSlash}`;
    const fullMarker = marker
      ? `${this.objectPrefix}${checkKey(marker.replace(/\/$/, ""))}${marker.endsWith("/") ? "/" : ""}`
      : undefined;
    const keys = await this.store.list(fullPrefix, fullMarker);
    return keys
      .filter((key) => key.startsWith(this.objectPrefix))
      .map((key) => key.slice(this.objectPrefix.length));
  }

  async remove(key: string) {
    await this.store.remove(this.key(key));
  }

  async bytes(key: string) {
    return this.store.bytes(this.key(key));
  }

  async readPrefix(key: string, length: number) {
    return this.store.readPrefix(this.key(key), length);
  }

  async readSuffix(key: string, length: number, size?: number) {
    return this.store.readSuffix(this.key(key), length, size);
  }

  async readStream(key: string) {
    return this.store.readStream(this.key(key));
  }

  async writeBytes(
    key: string,
    data: Uint8Array,
    contentType: string,
    cacheControl?: string,
  ) {
    await this.store.writeBytes(this.key(key), data, contentType, cacheControl);
  }

  async head(key: string) {
    return this.store.head(this.key(key));
  }

  async copyPublic(from: string, to: string, contentType: string) {
    await this.store.copyPublic(this.key(from), this.key(to), contentType);
  }

  async copyPrivate(from: string, to: string, contentType: string) {
    await this.store.copyPrivate(this.key(from), this.key(to), contentType);
  }

  async signGet(key: string, expiresIn?: number) {
    return this.store.signGet(this.key(key), expiresIn);
  }

  async signPut(key: string, contentType: string) {
    return this.store.signPut(this.key(key), contentType);
  }

  async multipartStart(key: string, contentType: string) {
    return this.store.multipartStart(this.key(key), contentType);
  }

  async multipartPart(key: string, uploadId: string, part: number) {
    return this.store.multipartPart(this.key(key), uploadId, part);
  }

  async multipartComplete(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[],
  ) {
    await this.store.multipartComplete(this.key(key), uploadId, parts);
  }

  async multipartAbort(key: string, uploadId: string) {
    await this.store.multipartAbort(this.key(key), uploadId);
  }

  async purgePrefixBatch(prefix: string) {
    const normalized = prefix.replace(/^\/+|\/+$/g, "");
    return this.store.purgePrefixBatch(
      normalized
        ? `${this.objectPrefix}${checkKey(normalized)}/`
        : this.objectPrefix,
    );
  }

  publicUrl(key: string) {
    return this.store.publicUrl(this.key(key));
  }
}

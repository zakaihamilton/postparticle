"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { GuardedLink as Link } from "./navigation-guard";
import type { Media } from "@/lib/types";
import { ApiError, api, Empty, Icon, Notice } from "./ui";
import styles from "./workspace.module.css";
import libraryStyles from "./media-library.module.css";
interface PendingUpload {
  id: string;
  parts: { PartNumber: number; ETag: string }[];
}
interface UploadStart {
  id: string;
  multipart: boolean;
  partSize: number;
  url: string | null;
}
interface MediaLibraryItem extends Media {
  previewUrl: string | null;
}
interface MediaLibraryPage {
  items: MediaLibraryItem[];
  total: number;
  nextOffset: number | null;
}
const pageSize = 24;
const supportedMediaTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);
export default function MediaLibrary({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const endpoint = `/api/manage/projects/${projectId}/media`;
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [failedPreviews, setFailedPreviews] = useState<Set<string>>(
    () => new Set(),
  );
  const [refreshingPreviews, setRefreshingPreviews] = useState<Set<string>>(
    () => new Set(),
  );
  const queryRef = useRef(q);
  const previewRetries = useRef(new Set<string>());
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const loading = loadedQuery !== q;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        offset: "0",
        limit: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      api<MediaLibraryPage>(`${endpoint}?${params}`, {
        signal: controller.signal,
      })
        .then((page) => {
          if (!active) return;
          setItems(page.items);
          setTotal(page.total);
          setNextOffset(page.nextOffset);
          setPreviewUrls({});
          setFailedPreviews(new Set());
          previewRetries.current.clear();
          setLoadedQuery(q);
        })
        .catch((e) => {
          if (!active) return;
          setError(e.message);
          setItems([]);
          setTotal(0);
          setNextOffset(null);
          setLoadedQuery(q);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, q]);

  useEffect(() => () => abort.current?.abort(), [endpoint]);

  async function reload() {
    const query = queryRef.current;
    const params = new URLSearchParams({
      offset: "0",
      limit: String(pageSize),
    });
    if (query.trim()) params.set("q", query.trim());
    const page = await api<MediaLibraryPage>(`${endpoint}?${params}`);
    if (queryRef.current !== query) return;
    setItems(page.items);
    setTotal(page.total);
    setNextOffset(page.nextOffset);
    setError("");
    setLoadedQuery(query);
    setPreviewUrls({});
    setFailedPreviews(new Set());
    previewRetries.current.clear();
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    const query = queryRef.current;
    setLoadingMore(true);
    setError("");
    try {
      const params = new URLSearchParams({
        offset: String(nextOffset),
        limit: String(pageSize),
      });
      if (query.trim()) params.set("q", query.trim());
      const page = await api<MediaLibraryPage>(`${endpoint}?${params}`);
      if (queryRef.current !== query) return;
      setItems((current) => [...current, ...page.items]);
      setTotal(page.total);
      setNextOffset(page.nextOffset);
    } catch (e) {
      if (queryRef.current === query) setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshPreview(id: string) {
    if (refreshingPreviews.has(id)) return;
    setRefreshingPreviews((current) => new Set(current).add(id));
    try {
      const result = await api<{ url: string }>(
        `${endpoint}/${id}/preview-thumbnail`,
      );
      setPreviewUrls((current) => ({ ...current, [id]: result.url }));
      setFailedPreviews((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch {
      setFailedPreviews((current) => new Set(current).add(id));
    } finally {
      setRefreshingPreviews((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function handlePreviewError(id: string) {
    if (previewRetries.current.has(id)) {
      setFailedPreviews((current) => new Set(current).add(id));
      return;
    }
    previewRetries.current.add(id);
    void refreshPreview(id);
  }
  async function upload(file: File) {
    let uploadId: string | undefined;
    let uploaded = false;
    const parts: PendingUpload["parts"] = [];
    const controller = new AbortController();
    abort.current = controller;
    setProgress(0);
    setError("");
    setMessage("");
    try {
      const started = await api<UploadStart>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
        signal: controller.signal,
      });
      uploadId = started.id;
      if (started.multipart) {
        const count = Math.ceil(file.size / started.partSize);
        for (let part = 1; part <= count; part++) {
          const { url } = await api<{ url: string }>(
            `${endpoint}/${started.id}/part`,
            {
              method: "POST",
              body: JSON.stringify({ part }),
              signal: controller.signal,
            },
          );
          const response = await fetch(url, {
            method: "PUT",
            body: file.slice(
              (part - 1) * started.partSize,
              part * started.partSize,
            ),
            signal: controller.signal,
          });
          if (!response.ok)
            throw new Error(`Part ${part} failed. Please retry the upload.`);
          const etag = response.headers.get("ETag");
          if (!etag) throw new Error("Spaces CORS must expose the ETag header");
          parts.push({ PartNumber: part, ETag: etag });
          setProgress(Math.round((part / count) * 90));
        }
      } else {
        await putWithProgress(
          started.url!,
          file,
          controller.signal,
          setProgress,
        );
      }
      uploaded = true;
      await api(`${endpoint}/${started.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ parts }),
        signal: controller.signal,
      });
      await reload();
      setMessage(
        "Upload complete. Your asset is private until used in published content.",
      );
    } catch (e) {
      const cancelled = controller.signal.aborted;
      const rejectedContentType = e instanceof ApiError && e.status === 415;
      if (uploadId && uploaded && !cancelled && !rejectedContentType) {
        setPendingUpload({ id: uploadId, parts });
        setError(
          `${(e as Error).message} Your upload is retained; retry finalization below.`,
        );
        return;
      }
      if (uploadId) {
        try {
          await api(`${endpoint}/${uploadId}/abort`, { method: "POST" });
        } catch {
          setError(
            "Upload cleanup failed. Retry cleanup or use the documented lifecycle rule.",
          );
        }
      }
      if (!cancelled) setError((e as Error).message);
      else setMessage("Upload cancelled.");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }
  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!canEdit || progress !== null || pendingUpload || busy) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      setError("Drop one media file at a time.");
      return;
    }

    acceptFile(files[0]);
  }
  function acceptFile(file?: File) {
    if (!file) return;
    if (!supportedMediaTypes.has(file.type)) {
      setError("Use a JPEG, PNG, WebP, GIF, MP4, or WebM file.");
      return;
    }
    void upload(file);
  }
  async function mutate(task: () => Promise<void>, onSuccess?: () => void) {
    setError("");
    setBusy(true);
    try {
      await task();
      await reload();
      onSuccess?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const uploadDisabled = progress !== null || !!pendingUpload || busy;
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>YOUR CREATIVE COLLECTION</div>
          <h1>
            Media library
            <span className={styles.headingCount}>{loading ? "…" : total}</span>
          </h1>
          <p className={styles.subtitle}>
            A home for the images and videos that bring your content to life.
          </p>
        </div>
        {canEdit && (
          <div
            className={`${libraryStyles.uploadDropZone} ${dragging ? libraryStyles.dragging : ""}`}
            role="group"
            aria-label="Upload media"
            aria-describedby="upload-media-instructions"
            aria-disabled={uploadDisabled || undefined}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!uploadDisabled) setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = uploadDisabled ? "none" : "copy";
            }}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setDragging(false);
            }}
            onDrop={dropFiles}
          >
            <Icon name="upload" size={19} />
            <span>
              <strong>Drop media to upload</strong>
              <small id="upload-media-instructions">
                Drop one file, or choose a JPEG, PNG, WebP, GIF, MP4, or WebM
              </small>
            </span>
            <input
              ref={fileInput}
              className={libraryStyles.fileInput}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
              tabIndex={-1}
              aria-hidden="true"
              disabled={uploadDisabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                acceptFile(file);
              }}
            />
            <button
              className={libraryStyles.uploadBrowse}
              type="button"
              disabled={uploadDisabled}
              onClick={() => fileInput.current?.click()}
            >
              Choose file
            </button>
          </div>
        )}
      </div>
      <Notice error={loading ? "" : error} message={message} />
      {pendingUpload && (
        <div className={styles.uploadProgress}>
          <strong>Your uploaded file is waiting for finalization.</strong>
          <div>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() =>
                mutate(
                  async () => {
                    await api(`${endpoint}/${pendingUpload.id}/complete`, {
                      method: "POST",
                      body: JSON.stringify({ parts: pendingUpload.parts }),
                    });
                  },
                  () => {
                    setPendingUpload(null);
                    setMessage(
                      "Upload complete. Your asset is private until published.",
                    );
                  },
                )
              }
            >
              Retry finalization
            </button>
            <button
              className={styles.ghost}
              disabled={busy}
              onClick={() =>
                mutate(
                  async () => {
                    await api(`${endpoint}/${pendingUpload.id}/abort`, {
                      method: "POST",
                    });
                  },
                  () => {
                    setPendingUpload(null);
                    setMessage("Upload cleanup complete.");
                  },
                )
              }
            >
              Discard upload
            </button>
          </div>
        </div>
      )}
      {progress !== null && (
        <div className={styles.uploadProgress}>
          <div>
            <strong>Uploading your asset… {progress}%</strong>
            <button
              className={styles.ghost}
              onClick={() => abort.current?.abort()}
            >
              Cancel upload
            </button>
          </div>
          <progress value={progress} max={100} aria-label="Upload progress" />
        </div>
      )}
      <div className={styles.mediaToolbar}>
        <label className={styles.search}>
          <Icon name="search" size={17} />
          <input
            aria-label="Search media"
            placeholder="Search your media…"
            value={q}
            onChange={(e) => {
              queryRef.current = e.target.value;
              setError("");
              setQ(e.target.value);
            }}
          />
        </label>
        <span>Up to 32 MiB locally · 1 GiB on Spaces</span>
      </div>
      {loading ? (
        <div className={styles.loading}>Loading your library…</div>
      ) : total === 0 ? (
        <section className={styles.panel}>
          {q.trim() ? (
            <Empty title="No matching media">Try another filename.</Empty>
          ) : (
            <Empty title="No media yet" icon="image">
              Upload images or videos, add their details, and use them across
              your content.
            </Empty>
          )}
        </section>
      ) : (
        <>
          <div className={styles.mediaGrid}>
            {items.map((m) => {
              const isImage = m.contentType.startsWith("image/");
              const previewSrc =
                previewUrls[m.id] ??
                m.previewUrl ??
                `${endpoint}/${m.id}/thumbnail-file`;
              const previewFailed = failedPreviews.has(m.id);
              return (
                <div className={libraryStyles.mediaCardShell} key={m.id}>
                  <Link
                    className={styles.mediaCard}
                    href={`/workspace/${projectId}/media/${m.id}`}
                    prefetch={false}
                  >
                    <div className={styles.mediaThumbnail}>
                      {isImage && !previewFailed ? (
                        <img
                          src={previewSrc}
                          alt={m.alt || m.filename}
                          loading="lazy"
                          decoding="async"
                          onLoad={() => previewRetries.current.delete(m.id)}
                          onError={() => handlePreviewError(m.id)}
                        />
                      ) : isImage ? (
                        <span className={libraryStyles.previewUnavailable}>
                          Preview unavailable
                        </span>
                      ) : (
                        <>
                          <Icon name="image" size={35} />
                          <span>VIDEO</span>
                        </>
                      )}
                    </div>
                    <div className={styles.mediaInfo}>
                      <strong>{m.filename}</strong>
                      <span>
                        {m.contentType.split("/")[1].toUpperCase()}
                        <span>{formatSize(m.size)}</span>
                      </span>
                    </div>
                  </Link>
                  {isImage && previewFailed && (
                    <button
                      className={libraryStyles.retryPreview}
                      type="button"
                      disabled={refreshingPreviews.has(m.id)}
                      onClick={() => {
                        previewRetries.current.delete(m.id);
                        void refreshPreview(m.id);
                      }}
                    >
                      {refreshingPreviews.has(m.id)
                        ? "Retrying…"
                        : "Retry preview"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {nextOffset !== null && (
            <div className={libraryStyles.loadMore}>
              <button
                className={styles.secondary}
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore
                  ? "Loading more…"
                  : `Load more (${items.length} of ${total})`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
function formatSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function putWithProgress(
  url: string,
  file: File,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const cleanup = () => signal.removeEventListener("abort", cancel);
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 90));
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload failed. Please retry."));
    };
    xhr.onerror = () => {
      cleanup();
      reject(
        new Error("Upload failed. Check your connection and Spaces CORS."),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new Error("Upload cancelled"));
    };
    if (signal.aborted) {
      cleanup();
      reject(new Error("Upload cancelled"));
    } else xhr.send(file);
  });
}

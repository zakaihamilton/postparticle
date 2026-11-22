"use client";
import { useEffect, useRef, useState } from "react";
import { MediaGrid, type MediaLibraryItem } from "./media/media-grid";
import { executeUpload, type PendingUpload, supportedMediaTypes } from "./media/upload-client";
import { UploadDropzone } from "./media/upload-dropzone";
import libraryStyles from "./media-library.module.css";
import { api, Icon, Notice } from "./ui";
import styles from "./workspace-primitives.module.css";

interface MediaLibraryPage {
  items: MediaLibraryItem[];
  total: number;
  nextOffset: number | null;
}
const pageSize = 24;

export default function MediaLibrary({
  projectId,
  canEdit,
  request = api,
  previewUploadState,
  previewInitialQuery = "",
}: {
  projectId: string;
  canEdit: boolean;
  request?: typeof api;
  previewUploadState?: "uploading" | "failed";
  previewInitialQuery?: string;
}) {
  const endpoint = `/api/manage/projects/${projectId}/media`;
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState(
    previewUploadState === "failed" ? "Upload failed. Check your connection and retry." : "",
  );
  const [message, setMessage] = useState("");
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(
    previewUploadState === "uploading" ? 56 : null,
  );
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(previewInitialQuery);
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
      request<MediaLibraryPage>(`${endpoint}?${params}`, {
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
  }, [endpoint, q, request]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: endpoint changes must abort the previous request.
  useEffect(() => () => abort.current?.abort(), [endpoint]);

  async function reload() {
    const query = queryRef.current;
    const params = new URLSearchParams({
      offset: "0",
      limit: String(pageSize),
    });
    if (query.trim()) params.set("q", query.trim());
    const page = await request<MediaLibraryPage>(`${endpoint}?${params}`);
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
      const page = await request<MediaLibraryPage>(`${endpoint}?${params}`);
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
      const result = await request<{ url: string }>(
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
    await executeUpload({
      file,
      endpoint,
      request,
      setProgress,
      setPendingUpload,
      setError,
      setMessage,
      reload,
      abortRef: abort,
    });
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
        <UploadDropzone
          canEdit={canEdit}
          uploadDisabled={uploadDisabled}
          onAcceptFile={acceptFile}
          setError={setError}
        />
      </div>
      <Notice error={loading ? "" : error} message={message} />
      {pendingUpload && (
        <div className={libraryStyles.uploadProgress}>
          <strong>Your uploaded file is waiting for finalization.</strong>
          <div>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() =>
                mutate(
                  async () => {
                    await request(`${endpoint}/${pendingUpload.id}/complete`, {
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
                    await request(`${endpoint}/${pendingUpload.id}/abort`, {
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
        <div className={libraryStyles.uploadProgress}>
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
      <div className={libraryStyles.mediaToolbar}>
        <label className={`${styles.search} ${libraryStyles.mediaSearch}`}>
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
      <MediaGrid
        items={items}
        total={total}
        loading={loading}
        q={q}
        projectId={projectId}
        endpoint={endpoint}
        previewUrls={previewUrls}
        failedPreviews={failedPreviews}
        refreshingPreviews={refreshingPreviews}
        previewRetries={previewRetries}
        handlePreviewError={handlePreviewError}
        refreshPreview={refreshPreview}
        nextOffset={nextOffset}
        loadingMore={loadingMore}
        loadMore={loadMore}
      />
    </>
  );
}

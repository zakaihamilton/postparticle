"use client";
import Link from "next/link";
import type { Media } from "@/lib/types";
import libraryStyles from "../media-library.module.css";
import { Empty, Icon } from "../ui";
import styles from "../workspace-primitives.module.css";

export interface MediaLibraryItem extends Media {
  previewUrl: string | null;
}

export function MediaGrid({
  items,
  total,
  loading,
  q,
  projectId,
  endpoint,
  previewUrls,
  failedPreviews,
  refreshingPreviews,
  previewRetries,
  handlePreviewError,
  refreshPreview,
  nextOffset,
  loadingMore,
  loadMore,
}: {
  items: MediaLibraryItem[];
  total: number;
  loading: boolean;
  q: string;
  projectId: string;
  endpoint: string;
  previewUrls: Record<string, string>;
  failedPreviews: Set<string>;
  refreshingPreviews: Set<string>;
  previewRetries: React.MutableRefObject<Set<string>>;
  handlePreviewError: (id: string) => void;
  refreshPreview: (id: string) => Promise<void>;
  nextOffset: number | null;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
}) {
  if (loading) {
    return <div className={styles.loading}>Loading your library…</div>;
  }
  if (total === 0) {
    return (
      <section className={styles.panel}>
        {q.trim() ? (
          <Empty title="No matching media">Try another filename.</Empty>
        ) : (
          <Empty title="No media yet" icon="image">
            Upload images or videos, add their details, and use them across your
            content.
          </Empty>
        )}
      </section>
    );
  }

  function formatSize(size: number) {
    return size < 1024 * 1024
      ? `${Math.ceil(size / 1024)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <>
      <div className={libraryStyles.mediaGrid}>
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
                className={libraryStyles.mediaCard}
                href={`/workspace/${projectId}/media/${m.id}`}
                prefetch={false}
              >
                <div className={libraryStyles.mediaThumbnail}>
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
                <div className={libraryStyles.mediaInfo}>
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
                  {refreshingPreviews.has(m.id) ? "Retrying…" : "Retry preview"}
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
  );
}

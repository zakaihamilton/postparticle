"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Media } from "@/lib/types";
import { api, Notice } from "./ui";
import { GuardedLink as Link } from "./navigation-guard";
import styles from "./workspace.module.css";
import libraryStyles from "./media-library.module.css";

export default function MediaDetails({
  projectId,
  media: initialMedia,
  previewUrl,
  canEdit,
}: {
  projectId: string;
  media: Media;
  previewUrl: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const endpoint = `/api/manage/projects/${projectId}/media`;
  const [media, setMedia] = useState(initialMedia);
  const [metadata, setMetadata] = useState(
    JSON.stringify(initialMedia.metadata, null, 2),
  );
  const [fileUrl, setFileUrl] = useState(previewUrl);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRetryUsed = useRef(false);

  async function refreshPreview() {
    setPreviewError(false);
    setError("");
    try {
      const result = await api<{ url: string }>(
        `${endpoint}/${media.id}/preview`,
      );
      setFileUrl(result.url);
    } catch (e) {
      setPreviewError(true);
      setError((e as Error).message);
    }
  }

  function handlePreviewError() {
    if (previewRetryUsed.current) {
      setPreviewError(true);
      return;
    }
    previewRetryUsed.current = true;
    void refreshPreview();
  }

  function handlePreviewLoad() {
    previewRetryUsed.current = false;
    setPreviewError(false);
  }

  async function saveDetails() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsedMetadata: unknown = JSON.parse(metadata);
      await api(`${endpoint}/${media.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          alt: media.alt,
          caption: media.caption,
          metadata: parsedMetadata,
        }),
      });
      setMessage("Asset details saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAsset() {
    setBusy(true);
    setError("");
    try {
      await api(`${endpoint}/${media.id}`, { method: "DELETE" });
      router.push(`/workspace/${projectId}/media`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const isVideo = media.contentType.startsWith("video/");
  return (
    <section className={`${styles.panel} ${styles.assetDetails}`}>
      <div className={libraryStyles.detailHeader}>
        <Link className={styles.ghost} href={`/workspace/${projectId}/media`}>
          ← Back to media library
        </Link>
        <div>
          <div className={styles.eyebrow}>MEDIA ASSET</div>
          <h1>{media.filename}</h1>
          <p className={styles.subtitle}>
            {media.contentType.split("/")[1].toUpperCase()} ·{" "}
            {formatSize(media.size)}
          </p>
        </div>
      </div>
      <Notice error={error} message={message} />
      <div className={styles.assetDetailGrid}>
        <div>
          {previewError ? (
            <div className={libraryStyles.detailPreviewError} role="status">
              <p>The preview could not be loaded.</p>
              <button
                className={styles.secondary}
                type="button"
                onClick={() => {
                  previewRetryUsed.current = false;
                  void refreshPreview();
                }}
              >
                Retry preview
              </button>
            </div>
          ) : isVideo ? (
            <video
              controls
              src={fileUrl}
              onError={handlePreviewError}
              onLoadedData={handlePreviewLoad}
            >
              <track kind="captions" />
            </video>
          ) : (
            <img
              src={fileUrl}
              alt={media.alt || media.filename}
              decoding="async"
              onLoad={handlePreviewLoad}
              onError={handlePreviewError}
            />
          )}
          <p className={styles.subtitle}>
            Media reference: <code>media:{media.id}</code>
          </p>
        </div>
        <div className={styles.formSection}>
          <label>
            Alt text
            <input
              readOnly={!canEdit}
              value={media.alt}
              onChange={(event) =>
                setMedia({ ...media, alt: event.target.value })
              }
            />
          </label>
          <label>
            Caption
            <input
              readOnly={!canEdit}
              value={media.caption}
              onChange={(event) =>
                setMedia({ ...media, caption: event.target.value })
              }
            />
          </label>
          <label>
            Metadata JSON
            <textarea
              className={styles.codeInput}
              readOnly={!canEdit}
              rows={8}
              value={metadata}
              onChange={(event) => setMetadata(event.target.value)}
            />
          </label>
          {canEdit && (
            <div className={styles.buttonGroup}>
              <button
                className={styles.primary}
                type="button"
                disabled={busy}
                onClick={() => void saveDetails()}
              >
                Save details
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                disabled={busy}
                onClick={() => void deleteAsset()}
              >
                Delete asset
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/types";
import { api, Empty, Icon, Notice } from "./ui";
import styles from "./workspace.module.css";
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
export default function MediaLibrary({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const endpoint = `/api/manage/projects/${projectId}/media`;
  const [items, setItems] = useState<Media[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
    null,
  );
  const [selected, setSelected] = useState<Media | null>(null);
  const [metadata, setMetadata] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const abort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    api<Media[]>(endpoint)
      .then((m) => {
        if (active) {
          setItems(m);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [endpoint]);
  async function reload() {
    setItems(await api<Media[]>(endpoint));
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
      if (uploadId && uploaded && !cancelled) {
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
      if (fileInput.current) fileInput.current.value = "";
    }
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
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>YOUR CREATIVE COLLECTION</div>
          <h1>
            Media library
            <span className={styles.headingCount}>{items.length}</span>
          </h1>
          <p className={styles.subtitle}>
            A home for the images and videos that bring your content to life.
          </p>
        </div>
        {canEdit && (
          <button
            className={styles.primary}
            disabled={progress !== null || !!pendingUpload || busy}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="upload" size={17} />
            Upload media
          </button>
        )}
        <input
          ref={fileInput}
          className={styles.srOnly}
          aria-label="Upload media file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
          }}
        />
      </div>
      <Notice error={error} message={message} />
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
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <span>Images & videos · up to 1 GiB</span>
      </div>
      {loading ? (
        <div className={styles.loading}>Loading your library…</div>
      ) : !items.length ? (
        <section className={styles.panel}>
          <Empty title="Give your stories something to show">
            Upload images or videos, add their details, and use them across your
            content.
          </Empty>
        </section>
      ) : (
        <div className={styles.mediaGrid}>
          {items
            .filter((m) => m.filename.toLowerCase().includes(q.toLowerCase()))
            .map((m) => (
              <button
                key={m.id}
                className={styles.mediaCard}
                onClick={() => {
                  setSelected(m);
                  setMetadata(JSON.stringify(m.metadata, null, 2));
                }}
              >
                <div className={styles.mediaThumbnail}>
                  {m.contentType.startsWith("image/") ? (
                    <img
                      src={`${endpoint}/${m.id}/preview-file`}
                      alt={m.alt || m.filename}
                    />
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
              </button>
            ))}
        </div>
      )}
      {selected && (
        <section className={`${styles.panel} ${styles.assetDetails}`}>
          <div className={styles.panelHeading}>
            <h2>{selected.filename}</h2>
            <button className={styles.ghost} onClick={() => setSelected(null)}>
              Close details
            </button>
          </div>
          <div className={styles.assetDetailGrid}>
            <div>
              {selected.contentType.startsWith("video/") ? (
                <video controls src={`${endpoint}/${selected.id}/preview-file`}>
                  <track kind="captions" />
                </video>
              ) : (
                <img
                  src={`${endpoint}/${selected.id}/preview-file`}
                  alt={selected.alt || selected.filename}
                />
              )}
              <p className={styles.subtitle}>
                Media reference: <code>media:{selected.id}</code>
              </p>
            </div>
            <div className={styles.formSection}>
              <label>
                Alt text
                <input
                  readOnly={!canEdit}
                  value={selected.alt}
                  onChange={(e) =>
                    setSelected({ ...selected, alt: e.target.value })
                  }
                />
              </label>
              <label>
                Caption
                <input
                  readOnly={!canEdit}
                  value={selected.caption}
                  onChange={(e) =>
                    setSelected({ ...selected, caption: e.target.value })
                  }
                />
              </label>
              <label>
                Metadata JSON
                <textarea
                  className={styles.codeInput}
                  readOnly={!canEdit}
                  rows={5}
                  value={metadata}
                  onChange={(e) => setMetadata(e.target.value)}
                />
              </label>
              {canEdit && (
                <div className={styles.buttonGroup}>
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={() =>
                      mutate(async () => {
                        await api(`${endpoint}/${selected.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            alt: selected.alt,
                            caption: selected.caption,
                            metadata: JSON.parse(metadata),
                          }),
                        });
                        setMessage("Asset details saved.");
                      })
                    }
                  >
                    Save details
                  </button>
                  <button
                    className={styles.dangerButton}
                    disabled={busy}
                    onClick={() =>
                      mutate(async () => {
                        await api(`${endpoint}/${selected.id}`, {
                          method: "DELETE",
                        });
                        setSelected(null);
                        setMessage("Asset deleted.");
                      })
                    }
                  >
                    Delete asset
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
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

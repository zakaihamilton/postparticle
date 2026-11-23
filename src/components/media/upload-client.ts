import { ApiError, api } from "../ui";

export interface PendingUpload {
  id: string;
  parts: { PartNumber: number; ETag: string }[];
}

export interface UploadStart {
  id: string;
  multipart: boolean;
  partSize: number;
  url: string | null;
}

export const supportedMediaTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

async function putWithProgress(
  url: string,
  file: File,
  signal: AbortSignal,
  onProgress: (pct: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 90));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    signal.addEventListener("abort", () => {
      xhr.abort();
      reject(new Error("Upload aborted"));
    });
    xhr.send(file);
  });
}

export async function executeUpload({
  file,
  endpoint,
  request = api,
  setProgress,
  setPendingUpload,
  setError,
  setMessage,
  reload,
  abortRef,
}: {
  file: File;
  endpoint: string;
  request?: typeof api;
  setProgress: (val: number | null) => void;
  setPendingUpload: (val: PendingUpload | null) => void;
  setError: (val: string) => void;
  setMessage: (val: string) => void;
  reload: () => Promise<void>;
  abortRef: React.MutableRefObject<AbortController | null>;
}) {
  let uploadId: string | undefined;
  let uploaded = false;
  const parts: PendingUpload["parts"] = [];
  const controller = new AbortController();
  abortRef.current = controller;
  setProgress(0);
  setError("");
  setMessage("");
  try {
    const started = await request<UploadStart>(endpoint, {
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
        const { url } = await request<{ url: string }>(
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
    await request(`${endpoint}/${started.id}/complete`, {
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
        await request(`${endpoint}/${uploadId}/abort`, { method: "POST" });
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
    abortRef.current = null;
  }
}

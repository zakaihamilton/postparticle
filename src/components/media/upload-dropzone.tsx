"use client";
import { type DragEvent, useRef, useState } from "react";
import libraryStyles from "../media-library.module.css";
import { Icon } from "../ui";
import { supportedMediaTypes } from "./upload-client";

export function UploadDropzone({
  canEdit,
  uploadDisabled,
  onAcceptFile,
  setError,
}: {
  canEdit: boolean;
  uploadDisabled: boolean;
  onAcceptFile: (file?: File) => void;
  setError: (val: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!canEdit || uploadDisabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      setError("Drop one media file at a time.");
      return;
    }

    onAcceptFile(files[0]);
  }

  if (!canEdit) return null;

  return (
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
          !event.currentTarget.contains(event.relatedTarget as Node | null)
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
          onAcceptFile(file);
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
  );
}

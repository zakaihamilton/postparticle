"use client";
import { useState } from "react";
import { Icon } from "../ui";
import styles from "./developers.module.css";
export default function CodeBlock({
  filename,
  code,
}: {
  filename: string;
  code: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span>{filename}</span>
        <button
          type="button"
          aria-label={`Copy ${filename}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setState("copied");
            } catch {
              setState("error");
            }
          }}
        >
          <Icon name={state === "copied" ? "check" : "code"} size={14} />
          {state === "copied"
            ? "Copied"
            : state === "error"
              ? "Retry copy"
              : "Copy"}
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Focus enables keyboard scrolling of long code. */}
      <pre tabIndex={0} aria-label={`${filename} source`}>
        <code>{code}</code>
      </pre>
      <span className={styles.copyStatus} role="status">
        {state === "copied"
          ? `${filename} copied to clipboard.`
          : state === "error"
            ? "Clipboard unavailable. Select the code to copy manually, or retry."
            : ""}
      </span>
    </div>
  );
}

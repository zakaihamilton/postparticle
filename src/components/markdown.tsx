"use client";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./workspace.module.css";
import { mediaReferenceId } from "@/lib/media-references";
export default function Markdown({
  body,
  projectId,
}: {
  body: string;
  projectId?: string;
}) {
  return (
    <div className={styles.prose}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => {
          const id = mediaReferenceId(url);
          return id && projectId
            ? `/api/manage/projects/${projectId}/media/${id}/preview-file`
            : defaultUrlTransform(url);
        }}
        components={{
          img: ({ src, alt }) => (
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt || ""}
            />
          ),
          a: ({ href, children }) => (
            <a href={href} rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

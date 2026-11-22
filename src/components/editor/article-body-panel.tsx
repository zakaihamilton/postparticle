"use client";
import type { Article, JsonDocument, Kind, Media } from "@/lib/types";
import Markdown from "../markdown";
import Select from "../select";
import { Icon } from "../ui";
import styles from "../workspace-primitives.module.css";
import editorStyles from "./editor.module.css";

export function ArticleBodyPanel({
  kind,
  projectId,
  content,
  jsonText,
  setJsonText,
  setDirty,
  readOnly,
  savedId,
  identifierEdited,
  setIdentifierEdited,
  update,
  run,
  insert,
  media,
  textarea,
}: {
  kind: Kind;
  projectId: string;
  content: Article | JsonDocument;
  jsonText: string;
  setJsonText: (val: string) => void;
  setDirty: (val: boolean) => void;
  readOnly: boolean;
  savedId: string | null;
  identifierEdited: boolean;
  setIdentifierEdited: (val: boolean) => void;
  update: (field: string, value: unknown) => void;
  run: (task: () => Promise<void>) => Promise<void>;
  insert: (text: string) => void;
  media: Media[];
  textarea: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const isArticle = kind === "articles";
  const article = content as Article;

  return (
    <div>
      <section className={styles.panel}>
        <div className={styles.formSection}>
          <label>
            Title
            <input
              readOnly={readOnly}
              value={content.title}
              onChange={(e) => {
                update("title", e.target.value);
                if (isArticle && !savedId && !identifierEdited)
                  update(
                    "slug",
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                      .slice(0, 80),
                  );
                else if (!isArticle && !savedId && !identifierEdited)
                  update(
                    "key",
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                      .slice(0, 80),
                  );
              }}
              placeholder={
                isArticle ? "Give your story a title" : "Give this document a name"
              }
            />
          </label>
          <label>
            {isArticle ? "Slug" : "Document key"}
            <input
              readOnly={readOnly || !!savedId}
              value={isArticle ? article.slug : (content as JsonDocument).key}
              onChange={(e) => {
                setIdentifierEdited(true);
                update(isArticle ? "slug" : "key", e.target.value);
              }}
              placeholder="a-little-room-for-ideas"
            />
            <small>
              The API identifier becomes permanent after the first save. Use
              lowercase letters, numbers, hyphens, and underscores.
            </small>
          </label>
          {isArticle && (
            <label>
              Excerpt
              <textarea
                readOnly={readOnly}
                value={article.excerpt}
                onChange={(e) => update("excerpt", e.target.value)}
                rows={3}
                placeholder="A short introduction to your story…"
              />
            </label>
          )}
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>{isArticle ? "The story" : "JSON content"}</h2>
          {!isArticle && (
            <button
              className={styles.ghost}
              disabled={readOnly}
              onClick={() =>
                run(async () => {
                  setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
                })
              }
            >
              Format JSON
            </button>
          )}
        </div>
        {isArticle ? (
          <>
            <div className={editorStyles.toolbar}>
              <button
                disabled={readOnly}
                aria-label="Insert bold text"
                onClick={() => insert("**bold text**")}
              >
                <strong>B</strong>
              </button>
              <button
                disabled={readOnly}
                aria-label="Insert italic text"
                onClick={() => insert("*italic text*")}
              >
                <em>I</em>
              </button>
              <button
                disabled={readOnly}
                aria-label="Insert heading"
                onClick={() => insert("\n## Heading\n")}
              >
                H2
              </button>
              <button
                disabled={readOnly}
                aria-label="Insert link"
                onClick={() => insert("[link text](https://example.com)")}
              >
                <Icon name="link" size={14} /> Link
              </button>
              <Select
                label="Insert media"
                className={editorStyles.mediaSelect}
                disabled={readOnly}
                value=""
                onValueChange={(value) => {
                  const m = media.find((m) => m.id === value);
                  if (m)
                    insert(
                      m.contentType.startsWith("image/")
                        ? `\n![${m.alt || m.filename}](media:${m.id})\n`
                        : `\n[${m.caption || m.filename}](media:${m.id})\n`,
                    );
                }}
                options={[
                  { value: "", label: "+ Media", disabled: true },
                  ...media.map((m) => ({ value: m.id, label: m.filename })),
                ]}
              />
            </div>
            <div className={editorStyles.markdownGrid}>
              <label className={editorStyles.markdownInput}>
                <span>MARKDOWN</span>
                <textarea
                  ref={textarea}
                  aria-label="Article body"
                  readOnly={readOnly}
                  value={article.body}
                  onChange={(e) => update("body", e.target.value)}
                  placeholder="Every story starts somewhere…"
                  rows={20}
                />
              </label>
              <div className={editorStyles.preview}>
                <span>LIVE PREVIEW</span>
                {article.body ? (
                  <Markdown body={article.body} projectId={projectId} />
                ) : (
                  <p className={editorStyles.previewPlaceholder}>
                    Your words will take shape here.
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className={styles.formSection}>
            <textarea
              className={styles.codeInput}
              aria-label="JSON content"
              readOnly={readOnly}
              rows={22}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
            />
            <small>
              Any valid JSON. Reference library media with a string such as
              &quot;media:asset-id&quot;.
            </small>
          </div>
        )}
      </section>
    </div>
  );
}

"use client";
import type { Article, JsonDocument, Media, RecordState } from "@/lib/types";
import DatePicker from "../date-picker";
import Select from "../select";
import styles from "../workspace-primitives.module.css";
import editorStyles from "./editor.module.css";

export function EditorSidebar({
  isArticle,
  isNew,
  canEdit,
  record,
  content,
  tagText,
  setTagText,
  setDirty,
  readOnly,
  busy,
  images,
  update,
  run,
  action,
}: {
  isArticle: boolean;
  isNew: boolean;
  canEdit: boolean;
  record: RecordState | null;
  content: Article | JsonDocument;
  tagText: string;
  setTagText: (val: string) => void;
  setDirty: (val: boolean) => void;
  readOnly: boolean;
  busy: boolean;
  images: Media[];
  update: (field: string, value: unknown) => void;
  run: (task: () => Promise<void>) => Promise<void>;
  action: (actionName: string, revision?: string) => Promise<void>;
}) {
  const article = content as Article;

  return (
    <aside className={editorStyles.editorAside}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Details</h2>
        </div>
        <div className={styles.formSection}>
          {isArticle && (
            <>
              <label>
                Author
                <input
                  readOnly={readOnly}
                  value={article.author}
                  onChange={(e) => update("author", e.target.value)}
                  placeholder="Author name"
                />
              </label>
              <DatePicker
                key={readOnly ? "readonly" : "editable"}
                label="Article date"
                value={article.articleDate}
                onChange={(value) => update("articleDate", value)}
                readOnly={readOnly}
              />
            </>
          )}
          <label>
            Tags
            <input
              aria-label="Tags"
              readOnly={readOnly}
              value={tagText}
              onChange={(e) => {
                setTagText(e.target.value);
                setDirty(true);
              }}
              placeholder="ideas, journal, updates"
            />
            <small>Separate tags with commas.</small>
          </label>
          {isArticle && (
            <label>
              Cover image
              <Select
                label="Cover image"
                stretch
                disabled={readOnly}
                value={article.coverMediaId}
                onValueChange={(value) => update("coverMediaId", value)}
                options={[
                  { value: "", label: "No cover image" },
                  ...images.map((m) => ({
                    value: m.id,
                    label: m.filename,
                  })),
                ]}
              />
            </label>
          )}
        </div>
      </section>
      {isArticle && (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Search & sharing</h2>
          </div>
          <div className={styles.formSection}>
            <label>
              SEO title
              <input
                readOnly={readOnly}
                value={article.seoTitle}
                onChange={(e) => update("seoTitle", e.target.value)}
                placeholder="Defaults to article title"
              />
            </label>
            <label>
              SEO description
              <textarea
                readOnly={readOnly}
                value={article.seoDescription}
                onChange={(e) => update("seoDescription", e.target.value)}
                rows={3}
                placeholder="Defaults to excerpt"
              />
            </label>
            <label>
              Social image
              <Select
                label="Social image"
                stretch
                disabled={readOnly}
                value={article.socialMediaId}
                onValueChange={(value) => update("socialMediaId", value)}
                options={[
                  { value: "", label: "Use cover image" },
                  ...images.map((m) => ({
                    value: m.id,
                    label: m.filename,
                  })),
                ]}
              />
            </label>
          </div>
        </section>
      )}
      {canEdit && !isNew && (
        <section className={styles.panel}>
          <div className={styles.formSection}>
            <h3>Publishing controls</h3>
            <p className={styles.subtitle}>
              Saved edits stay private until you publish.
            </p>
            {record?.published && (
              <button
                className={styles.secondary}
                disabled={busy}
                onClick={() => run(() => action("unpublish"))}
              >
                Unpublish
              </button>
            )}
            <button
              className={styles.dangerButton}
              disabled={busy}
              onClick={() =>
                run(() => action(record?.trashed ? "restore" : "trash"))
              }
            >
              {record?.trashed ? "Restore from trash" : "Move to trash"}
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}

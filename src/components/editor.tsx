"use client";
import { GuardedLink as Link, useUnsavedChanges } from "./navigation-guard";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  Article,
  Content,
  Event,
  JsonDocument,
  Kind,
  Media,
  RecordState,
} from "@/lib/types";
import { api, Icon, Notice } from "./ui";
import Markdown from "./markdown";
import { Status } from "./content-list";
import styles from "./workspace.module.css";
import Select from "./select";
import DatePicker from "./date-picker";
const blankArticle = (): Article => ({
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  author: "",
  tags: [],
  articleDate: new Date().toISOString().slice(0, 10),
  coverMediaId: "",
  seoTitle: "",
  seoDescription: "",
  socialMediaId: "",
});
const blankDocument = (): JsonDocument => ({
  title: "",
  key: "",
  tags: [],
  value: {},
});
export default function Editor({
  kind,
  id,
  projectId,
  canEdit,
}: {
  kind: Kind;
  id: string;
  projectId: string;
  canEdit: boolean;
}) {
  const isNew = id === "new";
  const isArticle = kind === "articles";
  const router = useRouter();
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id);
  const [content, setContent] = useState<Content>(
    isArticle ? blankArticle() : blankDocument(),
  );
  const [jsonText, setJsonText] = useState('{\n  "message": "Hello, world"\n}');
  const [tagText, setTagText] = useState("");
  const [record, setRecord] = useState<RecordState | null>(null);
  const [history, setHistory] = useState<Event<Content>[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [showHistory, setShowHistory] = useState(false);
  const [dirty, setDirty] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  useUnsavedChanges(dirty || busy);
  const endpoint = `/api/manage/projects/${projectId}/${kind}`;
  useEffect(() => {
    let active = true;
    api<Media[]>(`/api/manage/projects/${projectId}/media`)
      .then((m) => {
        if (active) setMedia(m);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (!isNew)
      Promise.all([
        api<RecordState>(`${endpoint}/${id}`),
        api<Event<Content>[]>(`${endpoint}/${id}/history`),
      ])
        .then(([r, h]) => {
          if (!active) return;
          setRecord(r);
          setContent(r.draft);
          setTagText(r.draft.tags.join(", "));
          if ("value" in r.draft)
            setJsonText(JSON.stringify(r.draft.value, null, 2));
          setHistory(h);
          setLoading(false);
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setLoading(false);
          }
        });
    return () => {
      active = false;
    };
  }, [endpoint, id, isNew, projectId]);
  function update(field: string, value: unknown) {
    if (inFlight.current) return;
    setContent((old) => ({ ...old, [field]: value }));
    setDirty(true);
  }
  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const r = await api<RecordState>(`${endpoint}/${id}`);
    setRecord(r);
    setHistory(await api<Event<Content>[]>(`${endpoint}/${id}/history`));
  }
  async function save(publish = false) {
    const payload: Content = {
      ...content,
      tags: tagText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      ...(!isArticle ? { value: JSON.parse(jsonText) } : {}),
    };
    const result = await api<{ id: string }>(
      savedId ? `${endpoint}/${savedId}` : endpoint,
      { method: savedId ? "PUT" : "POST", body: JSON.stringify(payload) },
    );
    setSavedId(result.id);
    setDirty(false);
    if (publish)
      await api(`${endpoint}/${result.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "publish" }),
      });
    if (isNew) router.replace(`/workspace/${projectId}/${kind}/${result.id}`);
    else {
      await refresh();
      setMessage(
        publish
          ? "Published. Your content is available through the API."
          : "Draft saved. Your published content stays as it is.",
      );
    }
  }
  async function action(action: string, revision?: string) {
    await api(`${endpoint}/${id}`, {
      method: "POST",
      body: JSON.stringify({ action, revision }),
    });
    if (action === "revision") {
      const r = await api<RecordState>(`${endpoint}/${id}`);
      setContent(r.draft);
      setTagText(r.draft.tags.join(", "));
      if ("value" in r.draft)
        setJsonText(JSON.stringify(r.draft.value, null, 2));
      setDirty(false);
    }
    await refresh();
    setMessage(
      action === "revision"
        ? "Revision restored as a draft."
        : "Content updated.",
    );
  }
  function insert(text: string) {
    if (!isArticle) return;
    const area = textarea.current;
    const body = (content as Article).body;
    const start = area?.selectionStart ?? body.length;
    const end = area?.selectionEnd ?? start;
    update("body", body.slice(0, start) + text + body.slice(end));
    area?.focus();
  }
  if (loading) return <div className={styles.loading}>Loading your draft…</div>;
  const article = content as Article;
  const images = media.filter((m) => m.contentType.startsWith("image/"));
  const readOnly = !canEdit || !!record?.trashed || busy;
  return (
    <>
      <Link
        href={`/workspace/${projectId}/${kind}`}
        className={styles.backLink}
      >
        <Icon name="arrow-left" size={14} /> All {kind}
      </Link>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>
            {isArticle ? "YOUR NEXT STORY" : "FLEXIBLE CONTENT"}
          </div>
          <h1>
            {isNew
              ? isArticle
                ? "A new article."
                : "A new document."
              : content.title || "Untitled"}
          </h1>
          <div className={styles.editorStatus}>
            {record && <Status record={record} />}
            <span>
              {dirty
                ? "Unsaved changes"
                : isNew
                  ? "Start with an idea. Make it yours."
                  : `Last saved ${new Date(record?.updatedAt || Date.now()).toLocaleString()}`}
            </span>
          </div>
        </div>
        {canEdit && !record?.trashed && (
          <div className={styles.buttonGroup}>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => run(() => save())}
            >
              {busy ? "Working…" : "Save draft"}
            </button>
            <button
              className={styles.primary}
              disabled={busy}
              onClick={() => run(() => save(true))}
            >
              <Icon name="globe" size={16} />
              Publish
            </button>
          </div>
        )}
      </div>
      <Notice error={error} message={message} />
      <div className={styles.editorGrid}>
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
                    if (isNew && !savedId)
                      update(
                        isArticle ? "slug" : "key",
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")
                          .slice(0, 80),
                      );
                  }}
                  placeholder={
                    isArticle
                      ? "Give your story a title"
                      : "Give this document a name"
                  }
                />
              </label>
              <label>
                {isArticle ? "Slug" : "Document key"}
                <input
                  readOnly={readOnly || !!savedId}
                  value={
                    isArticle ? article.slug : (content as JsonDocument).key
                  }
                  onChange={(e) =>
                    update(isArticle ? "slug" : "key", e.target.value)
                  }
                  placeholder="a-little-room-for-ideas"
                />
                <small>
                  The permanent API identifier. Lowercase letters, numbers,
                  hyphens, and underscores.
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
                      setJsonText(
                        JSON.stringify(JSON.parse(jsonText), null, 2),
                      );
                    })
                  }
                >
                  Format JSON
                </button>
              )}
            </div>
            {isArticle ? (
              <>
                <div className={styles.toolbar}>
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
                    className={styles.mediaSelect}
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
                <div className={styles.markdownGrid}>
                  <label className={styles.markdownInput}>
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
                  <div className={styles.preview}>
                    <span>LIVE PREVIEW</span>
                    {article.body ? (
                      <Markdown body={article.body} projectId={projectId} />
                    ) : (
                      <p className={styles.previewPlaceholder}>
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
          {!isNew && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <h2>Revision history</h2>
                <button
                  className={styles.ghost}
                  disabled={readOnly}
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? "Hide" : "Show"} {history.length} revisions
                </button>
              </div>
              {showHistory && (
                <div className={styles.history}>
                  {[...history].reverse().map((r) => (
                    <div key={r.id}>
                      <span>
                        <strong>{r.data.title}</strong>
                        <small>
                          {new Date(r.at).toLocaleString()} · {r.actor}
                        </small>
                      </span>
                      {canEdit && !record?.trashed && (
                        <button
                          className={styles.secondary}
                          disabled={busy}
                          onClick={() => run(() => action("revision", r.id))}
                        >
                          Restore draft
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
        <aside className={styles.editorAside}>
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
      </div>
    </>
  );
}

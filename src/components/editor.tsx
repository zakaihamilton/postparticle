"use client";
import { GuardedLink as Link, useUnsavedChanges } from "./navigation-guard";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Article,
  Content,
  EditorData,
  EditorHistoryItem,
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
import { collectMediaReferenceIds } from "@/lib/media-references";
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
const blankJsonText = '{\n  "message": "Hello, world"\n}';
export default function Editor({
  kind,
  id,
  projectId,
  canEdit,
  request = api,
}: {
  kind: Kind;
  id: string;
  projectId: string;
  canEdit: boolean;
  request?: typeof api;
}) {
  const isNew = id === "new";
  const isArticle = kind === "articles";
  const router = useRouter();
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id);
  const [content, setContent] = useState<Content>(
    isArticle ? blankArticle() : blankDocument(),
  );
  const [jsonText, setJsonText] = useState(blankJsonText);
  const [tagText, setTagText] = useState("");
  const [record, setRecord] = useState<RecordState | null>(null);
  const [history, setHistory] = useState<EditorHistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [media, setMedia] = useState<Media[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [showHistory, setShowHistory] = useState(false);
  const [dirty, setDirty] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const historyRequestVersion = useRef(0);
  useUnsavedChanges(dirty || busy);
  const endpoint = `/api/manage/projects/${projectId}/${kind}`;
  const editorDataQuery = new URLSearchParams({ kind, id });
  const editorDataEndpoint = `/api/manage/projects/${projectId}/editor?${editorDataQuery}`;
  const editorInitialEndpoint = `${editorDataEndpoint}&includeMedia=true`;
  const applyEditorData = useCallback(
    (data: EditorData, syncContent = false) => {
      if (data.media) setMedia(data.media);
      if (data.mediaError) setError(data.mediaError);
      if (syncContent) {
        if (data.record) {
          setRecord(data.record);
          setContent(data.record.draft);
          setTagText(data.record.draft.tags.join(", "));
          if ("value" in data.record.draft)
            setJsonText(JSON.stringify(data.record.draft.value, null, 2));
        } else {
          setRecord(null);
          setContent(isArticle ? blankArticle() : blankDocument());
          setTagText("");
          setJsonText(blankJsonText);
        }
      } else if (data.record) {
        setRecord(data.record);
      }
    },
    [isArticle],
  );
  useEffect(() => {
    let active = true;
    historyRequestVersion.current++;
    setHistory([]);
    setHistoryLoaded(false);
    setHistoryLoading(false);
    setShowHistory(false);
    setLoading(!isNew);
    setError("");
    request<EditorData>(editorInitialEndpoint)
      .then((data) => {
        if (!active) return;
        applyEditorData(data, !isNew);
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
  }, [applyEditorData, editorInitialEndpoint, isNew, request]);
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
  async function refresh(syncContent = false) {
    const data = await request<EditorData>(editorDataEndpoint);
    applyEditorData(data, syncContent);
    if (historyLoaded) await loadHistory();
  }
  async function loadHistory() {
    const requestVersion = ++historyRequestVersion.current;
    const items = await request<EditorHistoryItem[]>(
      `${endpoint}/${id}/history`,
    );
    if (requestVersion !== historyRequestVersion.current) return;
    setHistory(items);
    setHistoryLoaded(true);
  }
  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (historyLoaded) return;
    setHistoryLoading(true);
    const requestVersion = historyRequestVersion.current + 1;
    try {
      await loadHistory();
    } catch (e) {
      if (requestVersion === historyRequestVersion.current) {
        setError((e as Error).message);
        setShowHistory(false);
      }
    } finally {
      if (requestVersion === historyRequestVersion.current)
        setHistoryLoading(false);
    }
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
    const referencedMediaIds = new Set(collectMediaReferenceIds(payload));
    if (isArticle) {
      const articlePayload = payload as Article;
      for (const id of [
        articlePayload.coverMediaId,
        articlePayload.socialMediaId,
      ])
        if (id) referencedMediaIds.add(id.toLowerCase());
    }
    const referencedMediaCount = referencedMediaIds.size;
    if (
      publish &&
      referencedMediaCount > 0 &&
      !window.confirm(
        `Publishing will copy ${referencedMediaCount} referenced media ${referencedMediaCount === 1 ? "asset" : "assets"} to public URLs. Anyone with a URL can access those copies, and unpublishing does not revoke them. Continue?`,
      )
    )
      return;
    const result = await request<{ id: string }>(
      savedId ? `${endpoint}/${savedId}` : endpoint,
      { method: savedId ? "PUT" : "POST", body: JSON.stringify(payload) },
    );
    setSavedId(result.id);
    setDirty(false);
    if (publish)
      await request(`${endpoint}/${result.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "publish" }),
      });
    if (isNew) router.replace(`/workspace/${projectId}/${kind}/${result.id}`);
    else {
      await refresh(true);
      setMessage(
        publish
          ? referencedMediaCount
            ? `Published. Your content and ${referencedMediaCount} referenced media ${referencedMediaCount === 1 ? "asset are" : "assets are"} publicly available through the API.`
            : "Published. Your content is available through the API."
          : "Draft saved. Your published content stays as it is.",
      );
    }
  }
  async function action(action: string, revision?: string) {
    await request(`${endpoint}/${id}`, {
      method: "POST",
      body: JSON.stringify({ action, revision }),
    });
    await refresh(action === "revision");
    if (action === "revision") setDirty(false);
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
            {isArticle ? "ARTICLE" : "JSON DOCUMENT"}
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
                  ? "Add your content, then save a draft."
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
                  disabled={readOnly || historyLoading}
                  onClick={() => void toggleHistory()}
                >
                  {showHistory
                    ? `Hide ${history.length} revisions`
                    : historyLoaded
                      ? `Show ${history.length} revisions`
                      : "Show revision history"}
                </button>
              </div>
              {showHistory && (
                <div className={styles.history}>
                  {[...history].reverse().map((r) => (
                    <div key={r.id}>
                      <span>
                        <strong>{r.title}</strong>
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

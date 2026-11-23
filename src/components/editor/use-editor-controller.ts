"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { collectMediaReferenceIds } from "@/lib/media-references";
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
import { useUnsavedChanges } from "../navigation-guard";
import { api } from "../ui";

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

export function useEditorController({
  kind,
  id,
  projectId,
  canEdit,
  request = api,
  initialDirty = false,
}: {
  kind: Kind;
  id: string;
  projectId: string;
  canEdit: boolean;
  request?: typeof api;
  initialDirty?: boolean;
}) {
  const isNew = id === "new";
  const isArticle = kind === "articles";
  const router = useRouter();
  const [identifierEdited, setIdentifierEdited] = useState(false);
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [dirty, setDirty] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const historyRequestVersion = useRef(0);

  useUnsavedChanges(dirty || busy);

  useEffect(() => {
    if (initialDirty && !loading) setDirty(true);
  }, [initialDirty, loading]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAttempt is an explicit retry trigger for this request effect.
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
  }, [applyEditorData, editorInitialEndpoint, isNew, request, loadAttempt]);

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

  async function action(actionName: string, revision?: string) {
    await request(`${endpoint}/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: actionName, revision }),
    });
    await refresh(actionName === "revision");
    if (actionName === "revision") setDirty(false);
    setMessage(
      actionName === "revision"
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

  return {
    isNew,
    isArticle,
    identifierEdited,
    setIdentifierEdited,
    savedId,
    content,
    setContent,
    jsonText,
    setJsonText,
    tagText,
    setTagText,
    record,
    history,
    historyLoaded,
    historyLoading,
    media,
    error,
    message,
    busy,
    loading,
    setLoadAttempt,
    showHistory,
    dirty,
    setDirty,
    textarea,
    readOnly: !canEdit || !!record?.trashed || busy,
    images: media.filter((m) => m.contentType.startsWith("image/")),
    update,
    run,
    save,
    action,
    insert,
    toggleHistory,
  };
}

"use client";
import type { Kind } from "@/lib/types";
import { Status } from "./content-list";
import { ArticleBodyPanel } from "./editor/article-body-panel";
import editorStyles from "./editor/editor.module.css";
import { EditorSidebar } from "./editor/editor-sidebar";
import { RevisionHistoryPanel } from "./editor/revision-history-panel";
import { useEditorController } from "./editor/use-editor-controller";
import { GuardedLink as Link } from "./navigation-guard";
import { api, Icon, Notice } from "./ui";
import styles from "./workspace-primitives.module.css";

export default function Editor({
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
  const ctrl = useEditorController({
    kind,
    id,
    projectId,
    canEdit,
    request,
    initialDirty,
  });

  if (ctrl.loading)
    return <div className={styles.loading}>Loading your draft…</div>;

  if (!ctrl.isNew && !ctrl.record) {
    return (
      <>
        <Link
          href={`/workspace/${projectId}/${kind}`}
          className={styles.backLink}
        >
          <Icon name="arrow-left" size={14} /> All {kind}
        </Link>
        <h1>
          Unable to load this {ctrl.isArticle ? "article" : "document"}
        </h1>
        <Notice error={ctrl.error || "The content could not be loaded."} />
        <button
          className={styles.secondary}
          onClick={() => ctrl.setLoadAttempt((n) => n + 1)}
        >
          Try again
        </button>
      </>
    );
  }

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
            {ctrl.isArticle ? "ARTICLE" : "JSON DOCUMENT"}
          </div>
          <h1>
            {ctrl.isNew
              ? ctrl.isArticle
                ? "A new article."
                : "A new document."
              : ctrl.content.title || "Untitled"}
          </h1>
          <div className={editorStyles.editorStatus}>
            {ctrl.record && <Status record={ctrl.record} />}
            <span>
              {ctrl.dirty
                ? "Unsaved changes"
                : ctrl.isNew
                  ? "Add your content, then save a draft."
                  : `Last saved ${new Date(ctrl.record?.updatedAt || Date.now()).toLocaleString()}`}
            </span>
          </div>
        </div>
        {canEdit && !ctrl.record?.trashed && (
          <div className={styles.buttonGroup}>
            <button
              className={styles.secondary}
              disabled={ctrl.busy}
              onClick={() => ctrl.run(() => ctrl.save())}
            >
              {ctrl.busy ? "Working…" : "Save draft"}
            </button>
            <button
              className={styles.primary}
              disabled={ctrl.busy}
              onClick={() => ctrl.run(() => ctrl.save(true))}
            >
              <Icon name="globe" size={16} />
              Publish
            </button>
          </div>
        )}
      </div>
      <Notice error={ctrl.error} message={ctrl.message} />
      {!canEdit && (
        <p role="status">
          View-only access. Ask a project administrator for editing access.
        </p>
      )}
      <div className={editorStyles.editorGrid}>
        <div>
          <ArticleBodyPanel
            kind={kind}
            projectId={projectId}
            content={ctrl.content}
            jsonText={ctrl.jsonText}
            setJsonText={ctrl.setJsonText}
            setDirty={ctrl.setDirty}
            readOnly={ctrl.readOnly}
            savedId={ctrl.savedId}
            identifierEdited={ctrl.identifierEdited}
            setIdentifierEdited={ctrl.setIdentifierEdited}
            update={ctrl.update}
            run={ctrl.run}
            insert={ctrl.insert}
            media={ctrl.media}
            textarea={ctrl.textarea}
          />
          {!ctrl.isNew && (
            <RevisionHistoryPanel
              history={ctrl.history}
              historyLoaded={ctrl.historyLoaded}
              historyLoading={ctrl.historyLoading}
              showHistory={ctrl.showHistory}
              toggleHistory={ctrl.toggleHistory}
              canEdit={canEdit}
              record={ctrl.record}
              busy={ctrl.busy}
              run={ctrl.run}
              action={ctrl.action}
            />
          )}
        </div>
        <EditorSidebar
          isArticle={ctrl.isArticle}
          isNew={ctrl.isNew}
          canEdit={canEdit}
          record={ctrl.record}
          content={ctrl.content}
          tagText={ctrl.tagText}
          setTagText={ctrl.setTagText}
          setDirty={ctrl.setDirty}
          readOnly={ctrl.readOnly}
          busy={ctrl.busy}
          images={ctrl.images}
          update={ctrl.update}
          run={ctrl.run}
          action={ctrl.action}
        />
      </div>
    </>
  );
}

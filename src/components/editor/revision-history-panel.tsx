"use client";
import type { EditorHistoryItem, RecordState } from "@/lib/types";
import styles from "../workspace-primitives.module.css";
import editorStyles from "./editor.module.css";

export function RevisionHistoryPanel({
  history,
  historyLoaded,
  historyLoading,
  showHistory,
  toggleHistory,
  canEdit,
  record,
  busy,
  run,
  action,
}: {
  history: EditorHistoryItem[];
  historyLoaded: boolean;
  historyLoading: boolean;
  showHistory: boolean;
  toggleHistory: () => Promise<void>;
  canEdit: boolean;
  record: RecordState | null;
  busy: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
  action: (actionName: string, revision?: string) => Promise<void>;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2>Revision history</h2>
        <button
          className={styles.ghost}
          disabled={!canEdit || record?.trashed || historyLoading}
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
        <div className={editorStyles.history}>
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
  );
}

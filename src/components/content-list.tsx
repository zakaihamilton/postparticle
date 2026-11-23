"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ContentListData,
  ContentListRow,
  Kind,
} from "@/lib/types";
import { Status, Table } from "./content-table";
import { Dashboard } from "./dashboard";
import Select from "./select";
import { api, Empty, Icon, Notice } from "./ui";
import styles from "./workspace-primitives.module.css";

export { Dashboard, Status };

export function ContentList({
  kind,
  projectId,
  canEdit,
  previewData,
  previewError,
}: {
  kind: Kind;
  projectId: string;
  canEdit: boolean;
  previewData?: ContentListData;
  previewError?: string;
}) {
  const [rows, setRows] = useState<ContentListRow[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("active");
  const [order, setOrder] = useState("desc");
  const [retry, setRetry] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry is an explicit trigger after the user requests another load.
  useEffect(() => {
    if (previewData || previewError) return;
    let active = true;
    const timer = window.setTimeout(
      () => {
        setSearching(true);
        const query = new URLSearchParams({ view: "list", q });
        api<ContentListData>(
          `/api/manage/projects/${projectId}/${kind}?${query}`,
        )
          .then((data) => {
            if (active) {
              setRows(data.rows);
              setRecordCount(data.recordCount);
              setActiveCount(data.activeCount);
              setError("");
              setBusy(false);
              setSearching(false);
            }
          })
          .catch((e) => {
            if (active) {
              setError(e.message);
              setBusy(false);
              setSearching(false);
            }
          });
      },
      q ? 300 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [projectId, kind, q, previewData, previewError, retry]);

  const query = q.trim().toLowerCase();
  const visibleRows = previewData
    ? previewData.rows.filter(
        (row) =>
          !query || JSON.stringify(row.draft).toLowerCase().includes(query),
      )
    : rows;
  const displayedRecordCount = previewData?.recordCount ?? recordCount;
  const displayedActiveCount = previewData?.activeCount ?? activeCount;
  const filtered = visibleRows
    .filter(
      (r) =>
        (status === "trashed"
          ? r.trashed
          : !r.trashed &&
            (status === "active" ||
              (status === "published" ? !!r.published : !r.published))) &&
        (!tag || r.draft.tags.includes(tag.toLowerCase())),
    )
    .sort((a, b) => {
      const x = a.draft.articleDate ?? a.updatedAt;
      const y = b.draft.articleDate ?? b.updatedAt;
      return (
        x.localeCompare(y) * (order === "desc" ? -1 : 1) ||
        a.id.localeCompare(b.id)
      );
    });

  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>YOUR CONTENT</div>
          <h1>
            {kind === "articles" ? "Articles" : "JSON documents"}
            {!previewError && !error && (
              <span className={styles.headingCount}>
                {displayedActiveCount}
              </span>
            )}
          </h1>
          <p className={styles.subtitle}>
            {kind === "articles"
              ? "From first thought to final draft. Your stories live here."
              : "Flexible content for every corner of your website."}
          </p>
        </div>
        {canEdit && (
          <Link
            className={styles.primary}
            href={`/workspace/${projectId}/${kind}/new`}
          >
            <Icon name="plus" size={17} />
            New {kind === "articles" ? "article" : "document"}
          </Link>
        )}
      </div>
      <Notice error={previewError || error} />
      <section className={styles.panel}>
        <div className={styles.filters}>
          <label className={styles.search}>
            <Icon name="search" size={17} />
            <input
              aria-label="Search content"
              value={q}
              aria-busy={searching}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${kind}…`}
            />
          </label>
          <input
            className={styles.tagFilter}
            aria-label="Filter by tag"
            placeholder="Filter by tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
          <Select
            label="Content status"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "active", label: "All active" },
              { value: "published", label: "Published" },
              { value: "draft", label: "Drafts" },
              { value: "trashed", label: "Trash" },
            ]}
          />
          <Select
            label="Date order"
            value={order}
            onValueChange={setOrder}
            options={[
              { value: "desc", label: "Newest first" },
              { value: "asc", label: "Oldest first" },
            ]}
          />
        </div>
        {previewError || error ? (
          <div className={`${styles.loading} ${styles.loadError}`}>
            <p>Content could not be loaded.</p>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => {
                if (!previewError) {
                  setError("");
                  setBusy(true);
                  setRetry((n) => n + 1);
                }
              }}
            >
              Try again
            </button>
          </div>
        ) : !previewData && busy ? (
          <div className={styles.loading} role="status">
            Loading your content…
          </div>
        ) : filtered.length ? (
          <Table rows={filtered} kind={kind} projectId={projectId} />
        ) : (
          <Empty
            title={
              displayedRecordCount
                ? "No matching content"
                : `Your first ${kind === "articles" ? "story" : "document"} starts here`
            }
          >
            {displayedRecordCount
              ? "Try another search, tag, or status."
              : "Create something new. It will stay private until you publish it."}
          </Empty>
        )}
        {!previewError && !error && (
          <div className={styles.tableFooter}>
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
            <span>
              Sorted by {kind === "articles" ? "article date" : "last updated"}
            </span>
          </div>
        )}
      </section>
    </>
  );
}

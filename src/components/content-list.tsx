"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ContentListData,
  ContentListRow,
  Kind,
  PublicArticleMetadataIndexStatus,
  WorkspaceDashboard,
} from "@/lib/types";
import { api, Empty, Icon, Notice } from "./ui";
import styles from "./workspace.module.css";
import Select from "./select";
function recordTitle(r: { draft: { title: string } }) {
  return r.draft.title;
}
export function Status({
  record,
}: {
  record: { published: unknown; trashed: boolean };
}) {
  return (
    <span
      className={`${styles.badge} ${record.published && !record.trashed ? styles.published : ""}`}
    >
      <span />
      {record.trashed ? "Trashed" : record.published ? "Published" : "Draft"}
    </span>
  );
}
function Table({
  rows,
  kind,
  projectId,
}: {
  rows: ContentListRow[];
  kind: Kind;
  projectId: string;
}) {
  const dateLabel = kind === "articles" ? "Article date" : "Updated";
  return (
    <>
      <div className={`${styles.tableScroll} ${styles.contentListTableScroll}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{kind === "articles" ? "ARTICLE" : "DOCUMENT"}</th>
              <th>STATUS</th>
              <th>TAGS</th>
              <th>{kind === "articles" ? "ARTICLE DATE" : "UPDATED"}</th>
              <th>
                <span className={styles.srOnly}>Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link
                    href={`/workspace/${projectId}/${kind}/${r.id}`}
                    className={styles.recordTitle}
                  >
                    <span className={styles.recordIcon}>
                      <Icon
                        name={kind === "articles" ? "article" : "code"}
                        size={18}
                      />
                    </span>
                    <span>
                      <strong>{recordTitle(r)}</strong>
                      <small>
                        {kind === "articles" ? r.draft.author : r.draft.key}
                      </small>
                    </span>
                  </Link>
                </td>
                <td>
                  <Status record={r} />
                </td>
                <td>
                  <div className={styles.tags}>
                    {r.draft.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </td>
                <td className={styles.date}>
                  {kind === "articles"
                    ? r.draft.articleDate
                    : r.updatedAt.slice(0, 10)}
                </td>
                <td>
                  <Link
                    aria-label={`Open ${recordTitle(r)}`}
                    href={`/workspace/${projectId}/${kind}/${r.id}`}
                    className={styles.rowArrow}
                  >
                    <Icon name="arrow-up-right" size={17} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul
        className={styles.mobileRecordList}
        aria-label={kind === "articles" ? "Articles" : "JSON documents"}
      >
        {rows.map((r) => (
          <li className={styles.mobileRecordCard} key={r.id}>
            <div className={styles.mobileRecordTop}>
              <Link
                href={`/workspace/${projectId}/${kind}/${r.id}`}
                className={styles.mobileRecordTitle}
              >
                <strong>{recordTitle(r)}</strong>
                <small>
                  {kind === "articles" ? r.draft.author : r.draft.key}
                </small>
              </Link>
              <Status record={r} />
            </div>
            <div className={styles.mobileRecordMeta}>
              {!!r.draft.tags.length && (
                <div className={styles.mobileRecordMetaRow}>
                  <span className={styles.mobileRecordLabel}>Tags</span>
                  <div className={styles.tags}>
                    {r.draft.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className={styles.mobileRecordMetaRow}>
                <span className={styles.mobileRecordLabel}>{dateLabel}</span>
                <time
                  dateTime={
                    kind === "articles"
                      ? r.draft.articleDate
                      : r.updatedAt.slice(0, 10)
                  }
                >
                  {kind === "articles"
                    ? r.draft.articleDate
                    : r.updatedAt.slice(0, 10)}
                </time>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
export function ContentList({
  kind,
  projectId,
  canEdit,
}: {
  kind: Kind;
  projectId: string;
  canEdit: boolean;
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
  useEffect(() => {
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
  }, [projectId, kind, q]);
  const filtered = rows
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
            <span className={styles.headingCount}>{activeCount}</span>
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
      <Notice error={error} />
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
        {busy ? (
          <div className={styles.loading} role="status">
            Loading your content…
          </div>
        ) : filtered.length ? (
          <Table rows={filtered} kind={kind} projectId={projectId} />
        ) : (
          <Empty
            title={
              recordCount
                ? "No matching content"
                : `Your first ${kind === "articles" ? "story" : "document"} starts here`
            }
          >
            {recordCount
              ? "Try another search, tag, or status."
              : "Create something new. It will stay private until you publish it."}
          </Empty>
        )}
        <div className={styles.tableFooter}>
          {filtered.length} {filtered.length === 1 ? "item" : "items"}
          <span>
            Sorted by {kind === "articles" ? "article date" : "last updated"}
          </span>
        </div>
      </section>
    </>
  );
}
export function Dashboard({
  projectId,
  username,
  canEdit,
  canAdmin,
}: {
  projectId: string;
  username: string;
  canEdit: boolean;
  canAdmin: boolean;
}) {
  const [data, setData] = useState<WorkspaceDashboard | null>(null);
  const [error, setError] = useState("");
  const [updatedIndexStatus, setUpdatedIndexStatus] =
    useState<PublicArticleMetadataIndexStatus | null>(null);
  const [indexMessage, setIndexMessage] = useState("");
  const [indexError, setIndexError] = useState("");
  const [buildingIndex, setBuildingIndex] = useState(false);
  useEffect(() => {
    let active = true;
    api<WorkspaceDashboard>(`/api/manage/projects/${projectId}/dashboard`)
      .then((summary) => {
        if (active) setData(summary);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  async function buildIndex() {
    setBuildingIndex(true);
    setIndexError("");
    setIndexMessage("");
    try {
      const result = await api<{
        publicArticleMetadataIndex: PublicArticleMetadataIndexStatus;
      }>(`/api/manage/projects/${projectId}/article-metadata-index`, {
        method: "POST",
      });
      setUpdatedIndexStatus(result.publicArticleMetadataIndex);
      const total = result.publicArticleMetadataIndex.total ?? 0;
      setIndexMessage(
        `Index ready for ${total} published article${total === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setIndexError(
        e instanceof Error
          ? e.message
          : "Could not build the public article index.",
      );
    } finally {
      setBuildingIndex(false);
    }
  }
  const articles = data?.recentArticles ?? [];
  const indexStatus =
    updatedIndexStatus ?? data?.publicArticleMetadataIndex ?? null;
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>WORKSPACE OVERVIEW</div>
          <h1>Hello, {username}</h1>
          <p className={styles.subtitle}>
            Here’s what’s happening in your content workspace.
          </p>
        </div>
        {canEdit && (
          <Link
            className={styles.primary}
            href={`/workspace/${projectId}/articles/new`}
          >
            <Icon name="plus" size={17} />
            New article
          </Link>
        )}
      </div>
      <Notice error={error} />
      {indexStatus && (
        <section className={styles.panel} aria-busy={buildingIndex}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Public article index</h2>
              <p>
                {indexStatus.ready
                  ? `${indexStatus.total ?? 0} published article${indexStatus.total === 1 ? "" : "s"} are indexed.`
                  : "Build the index once to make existing published articles available through the metadata API."}
              </p>
            </div>
            {canAdmin && (
              <button
                type="button"
                className={styles.secondary}
                disabled={buildingIndex}
                onClick={buildIndex}
              >
                {buildingIndex
                  ? "Building index…"
                  : indexStatus.ready
                    ? "Rebuild index"
                    : "Build index"}
              </button>
            )}
          </div>
          {indexError || indexMessage ? (
            <Notice error={indexError} message={indexMessage} />
          ) : !indexStatus.ready && !canAdmin ? (
            <Notice message="Ask a project admin to build this index once." />
          ) : null}
        </section>
      )}
      <div className={styles.stats}>
        {[
          {
            title: "Total articles",
            value: data ? data.articleCount : "—",
            icon: "article",
            sub: "Active articles",
          },
          {
            title: "Published",
            value: data ? data.publishedCount : "—",
            icon: "globe",
            sub: "Available through the API",
          },
          {
            title: "Drafts",
            value: data ? data.articleCount - data.publishedCount : "—",
            icon: "clock",
            sub: "Not yet published",
          },
          {
            title: "Media assets",
            value: data ? data.mediaCount : "—",
            icon: "image",
            sub: "Images and video",
          },
        ].map((s) => (
          <div className={styles.stat} key={s.title}>
            <div>
              <span>{s.title}</span>
              <Icon name={s.icon} size={19} />
            </div>
            <strong>{s.value}</strong>
            <small>{s.sub}</small>
          </div>
        ))}
      </div>
      <div className={styles.dashboardBanner}>
        <div>
          <span className={styles.bannerEyebrow}>YOUR PUBLISHING WORKFLOW</span>
          <h2>Write privately. Publish when ready.</h2>
          <p>
            Changes to published articles stay in a private draft until you
            publish the next version.
          </p>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Recent articles</h2>
            <p>Your five most recently updated articles.</p>
          </div>
          <Link href={`/workspace/${projectId}/articles`}>
            View all articles <Icon name="arrow" size={15} />
          </Link>
        </div>
        {!data && !error ? (
          <div className={styles.loading}>Loading your workspace…</div>
        ) : articles.length ? (
          <Table rows={articles} kind="articles" projectId={projectId} />
        ) : (
          <Empty title="No articles yet">
            Create an article to start your content library.
          </Empty>
        )}
      </section>
      <div className={styles.quickLinks}>
        <Link href={`/workspace/${projectId}/media`}>
          <Icon name="image" />
          <div>
            <strong>Media library</strong>
            <span>Organize images, video, and metadata</span>
          </div>
          <Icon name="arrow" size={16} />
        </Link>
        <Link href={`/workspace/${projectId}/settings`}>
          <Icon name="code" />
          <div>
            <strong>Connect your website</strong>
            <span>Find your API endpoints and integration guides</span>
          </div>
          <Icon name="arrow" size={16} />
        </Link>
      </div>
    </>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  Article,
  JsonDocument,
  Kind,
  Media,
  RecordState,
} from "@/lib/types";
import { api, Empty, Icon, Notice } from "./ui";
import styles from "./workspace.module.css";
import Select from "./select";
function recordTitle(r: RecordState) {
  return r.draft.title;
}
export function Status({ record }: { record: RecordState }) {
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
  rows: RecordState[];
  kind: Kind;
  projectId: string;
}) {
  return (
    <div className={styles.tableScroll}>
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
                      {kind === "articles"
                        ? (r.draft as Article).author
                        : (r.draft as JsonDocument).key}
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
                  ? (r.draft as Article).articleDate
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
  const [rows, setRows] = useState<RecordState[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("active");
  const [order, setOrder] = useState("desc");
  useEffect(() => {
    let active = true;
    api<RecordState[]>(`/api/manage/projects/${projectId}/${kind}`)
      .then((data) => {
        if (active) {
          setRows(data);
          setError("");
          setBusy(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [projectId, kind]);
  const filtered = rows
    .filter(
      (r) =>
        (status === "trashed"
          ? r.trashed
          : !r.trashed &&
            (status === "active" ||
              (status === "published" ? !!r.published : !r.published))) &&
        (!q ||
          `${r.draft.title} ${"body" in r.draft ? r.draft.body : JSON.stringify(r.draft.value)}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!tag || r.draft.tags.includes(tag.toLowerCase())),
    )
    .sort((a, b) => {
      const x = "articleDate" in a.draft ? a.draft.articleDate : a.updatedAt;
      const y = "articleDate" in b.draft ? b.draft.articleDate : b.updatedAt;
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
            <span className={styles.headingCount}>
              {rows.filter((r) => !r.trashed).length}
            </span>
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
              rows.length
                ? "No matching content"
                : `Your first ${kind === "articles" ? "story" : "document"} starts here`
            }
          >
            {rows.length
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
}: {
  projectId: string;
  username: string;
  canEdit: boolean;
}) {
  const [data, setData] = useState<{
    articles: RecordState[];
    documents: RecordState[];
    media: Media[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      api<RecordState[]>(`/api/manage/projects/${projectId}/articles`),
      api<RecordState[]>(`/api/manage/projects/${projectId}/documents`),
      api<Media[]>(`/api/manage/projects/${projectId}/media`),
    ])
      .then(([articles, documents, media]) => {
        if (active) setData({ articles, documents, media });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  const articles = data?.articles.filter((r) => !r.trashed) ?? [];
  const published = articles.filter((r) => r.published).length;
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>A LITTLE SPACE FOR BIG IDEAS</div>
          <h1>
            Hello, {username}{" "}
            <span className={styles.spark}>
              <Icon name="sparkle" size={24} />
            </span>
          </h1>
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
      <div className={styles.stats}>
        {[
          {
            title: "Total articles",
            value: data ? articles.length : "—",
            icon: "article",
            sub: "Every story in one place",
          },
          {
            title: "Published",
            value: data ? published : "—",
            icon: "globe",
            sub: "Out in the world",
          },
          {
            title: "Drafts",
            value: data ? articles.length - published : "—",
            icon: "clock",
            sub: "Ideas in the making",
          },
          {
            title: "Media assets",
            value: data ? data.media.length : "—",
            icon: "image",
            sub: "Your creative collection",
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
          <span className={styles.bannerEyebrow}>MAKE YOURSELF AT HOME</span>
          <h2>Good content starts with a little space.</h2>
          <p>
            Write a story, collect your assets, or bring something new to your
            website.
          </p>
        </div>
        <span className={styles.bannerArt} aria-hidden="true">
          <Icon name="burst" size={100} />
        </span>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Recent articles</h2>
            <p>The latest ideas taking shape.</p>
          </div>
          <Link href={`/workspace/${projectId}/articles`}>
            View all articles <Icon name="arrow" size={15} />
          </Link>
        </div>
        {!data && !error ? (
          <div className={styles.loading}>Loading your workspace…</div>
        ) : articles.length ? (
          <Table
            rows={[...articles]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 5)}
            kind="articles"
            projectId={projectId}
          />
        ) : (
          <Empty title="A fresh start">
            Your articles will appear here. There’s plenty of room for your next
            idea.
          </Empty>
        )}
      </section>
      <div className={styles.quickLinks}>
        <Link href={`/workspace/${projectId}/media`}>
          <Icon name="image" />
          <div>
            <strong>Your media, together</strong>
            <span>Build a library for your stories</span>
          </div>
          <Icon name="arrow" size={16} />
        </Link>
        <Link href={`/workspace/${projectId}/settings`}>
          <Icon name="code" />
          <div>
            <strong>Connect your website</strong>
            <span>A simple API, endless possibilities</span>
          </div>
          <Icon name="arrow" size={16} />
        </Link>
      </div>
    </>
  );
}

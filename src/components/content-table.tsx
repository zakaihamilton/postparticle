"use client";
import Link from "next/link";
import type { ContentListRow, Kind } from "@/lib/types";
import listStyles from "./content-list.module.css";
import { Icon } from "./ui";
import styles from "./workspace-primitives.module.css";

function recordTitle(r: { draft: { title: string } }) {
  return r.draft.title;
}

function TagChips({ tags, className }: { tags: string[]; className: string }) {
  return (
    <div className={className}>
      {tags.slice(0, 3).map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
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

export function Table({
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
      <div
        className={`${styles.tableScroll} ${listStyles.contentListTableScroll}`}
      >
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
                    className={listStyles.recordTitle}
                  >
                    <span className={listStyles.recordIcon}>
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
                  <TagChips tags={r.draft.tags} className={styles.tags} />
                </td>
                <td className={listStyles.date}>
                  {kind === "articles"
                    ? r.draft.articleDate
                    : r.updatedAt.slice(0, 10)}
                </td>
                <td>
                  <Link
                    aria-label={`Open ${recordTitle(r)}`}
                    href={`/workspace/${projectId}/${kind}/${r.id}`}
                    className={listStyles.rowArrow}
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
        className={listStyles.mobileRecordList}
        aria-label={kind === "articles" ? "Articles" : "JSON documents"}
      >
        {rows.map((r) => (
          <li className={listStyles.mobileRecordCard} key={r.id}>
            <div className={listStyles.mobileRecordTop}>
              <Link
                href={`/workspace/${projectId}/${kind}/${r.id}`}
                className={listStyles.mobileRecordTitle}
              >
                <strong>{recordTitle(r)}</strong>
                <small>
                  {kind === "articles" ? r.draft.author : r.draft.key}
                </small>
              </Link>
              <Status record={r} />
            </div>
            <div className={listStyles.mobileRecordMeta}>
              {!!r.draft.tags.length && (
                <div className={listStyles.mobileRecordMetaRow}>
                  <span className={listStyles.mobileRecordLabel}>Tags</span>
                  <TagChips
                    tags={r.draft.tags}
                    className={`${styles.tags} ${listStyles.mobileRecordTags}`}
                  />
                </div>
              )}
              <div className={listStyles.mobileRecordMetaRow}>
                <span className={listStyles.mobileRecordLabel}>
                  {dateLabel}
                </span>
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

"use client";
import Link from "next/link";
import { Suspense, use } from "react";
import type { WorkspaceDashboardResult } from "@/lib/types";
import { Table } from "./content-table";
import dashboardStyles from "./dashboard.module.css";
import { Empty, Icon, Notice } from "./ui";
import styles from "./workspace-primitives.module.css";

export function Dashboard({
  projectId,
  username,
  canEdit,
  initialDashboard,
}: {
  projectId: string;
  username: string;
  canEdit: boolean;
  initialDashboard: Promise<WorkspaceDashboardResult>;
}) {
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
      <Suspense
        fallback={
          <div className={styles.loading} role="status">
            Loading workspace stats…
          </div>
        }
      >
        <DashboardStats initialDashboard={initialDashboard} />
      </Suspense>
      <div className={dashboardStyles.dashboardBanner}>
        <div>
          <span className={dashboardStyles.bannerEyebrow}>
            YOUR PUBLISHING WORKFLOW
          </span>
          <h2>Write privately. Publish when ready.</h2>
          <p>
            Changes to published articles stay in a private draft until you
            publish the next version.
          </p>
        </div>
      </div>
      <Suspense
        fallback={
          <section className={styles.panel} aria-busy="true">
            <div className={styles.loading} role="status">
              Loading recent articles…
            </div>
          </section>
        }
      >
        <DashboardRecent
          projectId={projectId}
          initialDashboard={initialDashboard}
        />
      </Suspense>
      <div className={dashboardStyles.quickLinks}>
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

function DashboardStats({
  initialDashboard,
}: {
  initialDashboard: Promise<WorkspaceDashboardResult>;
}) {
  const { data, error } = use(initialDashboard);
  return (
    <>
      <Notice error={error} />
      <div className={dashboardStyles.stats}>
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
        ].map((stat) => (
          <div className={dashboardStyles.stat} key={stat.title}>
            <div>
              <span>{stat.title}</span>
              <Icon name={stat.icon} size={19} />
            </div>
            <strong>{stat.value}</strong>
            <small>{stat.sub}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function DashboardRecent({
  projectId,
  initialDashboard,
}: {
  projectId: string;
  initialDashboard: Promise<WorkspaceDashboardResult>;
}) {
  const { data, error } = use(initialDashboard);
  const articles = data?.recentArticles ?? [];
  return (
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
      {data && articles.length ? (
        <Table rows={articles} kind="articles" projectId={projectId} />
      ) : data ? (
        <Empty title="No articles yet">
          Create an article to start your content library.
        </Empty>
      ) : (
        <div className={styles.loading} role="status">
          {error || "Workspace summary is unavailable."}
        </div>
      )}
    </section>
  );
}

"use client";

import { usePathname } from "next/navigation";
import styles from "./skeletons.module.css";
import {
  HeadingSkeleton,
  LoadingPage,
  Skeleton,
  SkeletonLines,
} from "./skeleton-primitives";

const workspaceViews = [
  { id: "", width: 82 },
  { id: "articles", width: 76 },
  { id: "media", width: 95 },
  { id: "documents", width: 108 },
  { id: "members", width: 72 },
  { id: "settings", width: 116 },
] as const;

export default function WorkspacePageSkeleton() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const view = segments[2] ?? "";
  const isEditor =
    (view === "articles" || view === "documents") && !!segments[3];
  const isMediaDetail = view === "media" && !!segments[3];
  const titleByView: Record<string, string> = {
    "": "Overview",
    articles: "Articles",
    documents: "JSON documents",
    media: "Media library",
    members: "Members",
    settings: "Settings & API",
  };
  const title = titleByView[view] ?? "Settings & API";

  return (
    <LoadingPage
      label={
        isMediaDetail
          ? "Loading media asset details"
          : `Loading workspace ${view || "overview"}`
      }
    >
      <div className={styles.workspaceShell}>
        <aside className={styles.workspaceSidebar}>
          <div className={styles.brand}>
            <Skeleton width={34} height={34} radius={6} />
            <Skeleton width={114} height={18} />
          </div>
          <div className={styles.workspaceProject}>
            <Skeleton width={37} height={37} radius={7} />
            <div className={styles.profileCopy}>
              <Skeleton width={125} height={12} />
              <Skeleton width={95} height={10} />
            </div>
            <Skeleton width={12} height={12} />
          </div>
          <Skeleton width={92} height={9} />
          <nav className={styles.workspaceNav}>
            {workspaceViews.slice(0, 4).map((item) => (
              <div
                className={`${styles.workspaceNavItem} ${view === item.id ? styles.navCurrent : ""}`}
                key={item.id || "overview"}
              >
                <Skeleton width={18} height={18} radius={4} />
                <Skeleton width={item.width} height={12} />
              </div>
            ))}
          </nav>
          <Skeleton width={59} height={9} className={styles.navCaption} />
          <nav className={styles.workspaceNav}>
            {workspaceViews.slice(4).map((item) => (
              <div
                className={`${styles.workspaceNavItem} ${view === item.id ? styles.navCurrent : ""}`}
                key={item.id}
              >
                <Skeleton width={18} height={18} radius={4} />
                <Skeleton width={item.width} height={12} />
              </div>
            ))}
          </nav>
          <div className={styles.workspaceSidebarBottom}>
            <Skeleton width="88%" height={11} />
            <div className={styles.identity}>
              <Skeleton width={36} height={36} radius="50%" />
              <div className={styles.profileCopy}>
                <Skeleton width={96} height={12} />
                <Skeleton width={54} height={10} />
              </div>
            </div>
          </div>
        </aside>
        <div className={styles.workspaceContent}>
          <header className={styles.workspaceTopbar}>
            <div className={styles.workspaceBreadcrumbs}>
              <Skeleton width={125} height={13} />
              <Skeleton width={8} height={8} radius="50%" />
              <Skeleton width={title.length > 15 ? 132 : 82} height={13} />
              {isMediaDetail && (
                <>
                  <Skeleton width={8} height={8} radius="50%" />
                  <Skeleton width={174} height={13} />
                </>
              )}
            </div>
            <div className={styles.topbarActions}>
              <Skeleton width={142} height={34} radius={6} />
              <Skeleton width={112} height={11} />
              <Skeleton width={38} height={34} radius={6} />
            </div>
          </header>
          <main className={styles.workspaceMain}>
            {isMediaDetail ? (
              <MediaDetailsSkeleton />
            ) : isEditor ? (
              <EditorSkeleton />
            ) : (
              renderView(view)
            )}
          </main>
          <footer className={styles.appFooter}>
            <Skeleton width={200} height={10} />
            <Skeleton width={83} height={10} />
          </footer>
        </div>
      </div>
    </LoadingPage>
  );
}

function renderView(view: string) {
  if (view === "articles" || view === "documents")
    return <ContentListSkeleton />;
  if (view === "media") return <MediaLibrarySkeleton />;
  if (view === "members") return <MembersSkeleton />;
  if (view === "settings") return <SettingsSkeleton />;
  return <DashboardSkeleton />;
}

function DashboardSkeleton() {
  return (
    <>
      <HeadingSkeleton titleWidth="37%" descriptionWidth="52%" action />
      <div className={styles.workspaceStats}>
        {[0, 1, 2, 3].map((stat) => (
          <div className={styles.statCard} key={stat}>
            <Skeleton width="62%" height={12} />
            <Skeleton width="42%" height={30} />
            <Skeleton width="73%" height={10} />
          </div>
        ))}
      </div>
      <div className={styles.workflowBanner}>
        <Skeleton width={165} height={10} />
        <Skeleton width="56%" height={23} />
        <Skeleton width="74%" height={11} />
      </div>
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <Skeleton width={124} height={17} />
          <Skeleton width={88} height={11} />
        </div>
        {[0, 1, 2].map((row) => (
          <div className={styles.tableSkeletonRow} key={row}>
            <Skeleton width={`${69 - row * 7}%`} height={13} />
            <Skeleton width="68%" height={11} />
            <Skeleton width="62%" height={11} />
            <Skeleton width={13} height={13} />
          </div>
        ))}
      </section>
      <div className={styles.quickLinks}>
        {[0, 1].map((link) => (
          <div className={styles.quickLink} key={link}>
            <Skeleton width={20} height={20} radius={4} />
            <div className={styles.profileCopy}>
              <Skeleton width={link ? 149 : 117} height={13} />
              <Skeleton width="92%" height={10} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ContentListSkeleton() {
  return (
    <>
      <HeadingSkeleton titleWidth="32%" descriptionWidth="59%" action />
      <section className={styles.skeletonPanel}>
        <div className={styles.tableFilters}>
          <Skeleton className={styles.filterSkeleton} />
          <Skeleton className={styles.filterSkeleton} />
          <Skeleton className={styles.filterSkeleton} />
          <Skeleton className={styles.filterSkeleton} />
        </div>
        <div className={styles.tableLabels}>
          <Skeleton width="37%" height={10} />
          <Skeleton width="47%" height={10} />
          <Skeleton width="55%" height={10} />
          <Skeleton width={12} height={12} />
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div className={styles.tableSkeletonRow} key={row}>
            <div className={styles.profileCopy}>
              <Skeleton width={`${72 - row * 4}%`} height={13} />
              <Skeleton width={`${87 - row * 6}%`} height={10} />
            </div>
            <Skeleton width="61%" height={11} />
            <Skeleton width="67%" height={11} />
            <Skeleton width={13} height={13} />
          </div>
        ))}
      </section>
    </>
  );
}

function EditorSkeleton() {
  return (
    <>
      <Skeleton width={139} height={13} />
      <HeadingSkeleton titleWidth="54%" descriptionWidth="48%" action />
      <div className={styles.editorGrid}>
        <div className={styles.editorMain}>
          <section className={styles.skeletonPanel}>
            <div className={styles.panelBody}>
              <div className={styles.field}>
                <Skeleton width={65} height={11} />
                <Skeleton className={styles.inputSkeleton} />
              </div>
              <div className={styles.field}>
                <Skeleton width={76} height={11} />
                <Skeleton className={styles.inputSkeleton} />
              </div>
              <div className={styles.editorBody}>
                <SkeletonLines
                  count={8}
                  widths={["91%", "83%", "94%", "72%"]}
                  height={10}
                />
              </div>
            </div>
          </section>
        </div>
        <aside className={styles.editorAside}>
          {[0, 1, 2].map((panel) => (
            <section className={styles.skeletonPanel} key={panel}>
              <div className={styles.panelHeading}>
                <Skeleton width="62%" height={14} />
              </div>
              <div className={styles.panelBody}>
                <Skeleton width="87%" height={11} />
                <Skeleton className={styles.inputSkeleton} />
              </div>
            </section>
          ))}
        </aside>
      </div>
    </>
  );
}

function MediaLibrarySkeleton() {
  return (
    <>
      <HeadingSkeleton titleWidth="42%" descriptionWidth="63%" action />
      <section className={styles.skeletonPanel}>
        <div className={styles.tableFilters}>
          <Skeleton className={styles.filterSkeleton} />
          <Skeleton className={styles.filterSkeleton} />
          <Skeleton width={118} height={40} className={styles.filterSkeleton} />
        </div>
        <div className={styles.panelBody}>
          <div className={styles.mediaGrid}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
              <div className={styles.mediaCard} key={item}>
                <Skeleton className={styles.mediaThumb} />
                <Skeleton width="76%" height={11} />
                <Skeleton width="48%" height={9} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function MediaDetailsSkeleton() {
  return (
    <section
      className={`${styles.skeletonPanel} ${styles.mediaDetailsPanel}`}
      aria-label="Media asset details"
    >
      <div className={styles.mediaDetailsHeading}>
        <Skeleton width={164} height={34} radius={5} />
        <div className={styles.profileCopy}>
          <Skeleton width={91} height={10} />
          <Skeleton width="min(440px, 72%)" height={31} />
          <Skeleton width={142} height={12} />
        </div>
      </div>
      <div className={styles.mediaDetailsGrid}>
        <div className={styles.mediaDetailsPreview}>
          <Skeleton className={styles.mediaDetailsImage} />
          <Skeleton width="81%" height={12} />
        </div>
        <div className={styles.mediaDetailsForm}>
          <div className={styles.field}>
            <Skeleton width={57} height={12} />
            <Skeleton className={styles.inputSkeleton} />
          </div>
          <div className={styles.field}>
            <Skeleton width={63} height={12} />
            <Skeleton className={styles.inputSkeleton} />
          </div>
          <div className={styles.field}>
            <Skeleton width={105} height={12} />
            <Skeleton className={styles.mediaMetadataSkeleton} />
          </div>
          <div className={styles.buttonGroupSkeleton}>
            <Skeleton width={116} height={40} radius={5} />
            <Skeleton width={118} height={40} radius={5} />
          </div>
        </div>
      </div>
    </section>
  );
}

function MembersSkeleton() {
  return (
    <>
      <HeadingSkeleton titleWidth="28%" descriptionWidth="54%" action />
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <Skeleton width={137} height={16} />
          <Skeleton width={128} height={35} radius={5} />
        </div>
        {[0, 1, 2].map((row) => (
          <div className={styles.memberRow} key={row}>
            <div className={styles.identity}>
              <Skeleton width={36} height={36} radius="50%" />
              <div className={styles.identityLines}>
                <Skeleton width={row ? 146 : 119} height={12} />
                <Skeleton width={88} height={10} />
              </div>
            </div>
            <Skeleton width={96} height={32} radius={5} />
          </div>
        ))}
      </section>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <HeadingSkeleton titleWidth="40%" descriptionWidth="71%" />
      <div className={styles.guideContents}>
        {[0, 1, 2].map((tab) => (
          <Skeleton key={tab} width={[98, 124, 113][tab]} height={12} />
        ))}
      </div>
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <div className={styles.profileCopy}>
            <Skeleton width={172} height={16} />
            <Skeleton width={246} height={11} />
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formColumns}>
            {[0, 1].map((field) => (
              <div className={styles.field} key={field}>
                <Skeleton width={field ? 98 : 91} height={11} />
                <Skeleton className={styles.inputSkeleton} />
              </div>
            ))}
          </div>
          <div className={styles.field}>
            <Skeleton width={107} height={11} />
            <Skeleton className={styles.inputSkeleton} />
          </div>
          <Skeleton width={135} height={40} radius={5} />
        </div>
      </section>
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <Skeleton width={191} height={16} />
        </div>
        <div className={styles.panelBody}>
          <SkeletonLines count={3} widths={["95%", "84%", "67%"]} />
          <Skeleton width={138} height={38} radius={5} />
        </div>
      </section>
    </>
  );
}

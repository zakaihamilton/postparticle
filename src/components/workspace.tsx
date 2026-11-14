"use client";
import {
  GuardedLink as Link,
  NavigationGuardProvider,
  useNavigationGuard,
} from "./navigation-guard";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";
import { DashboardShell as PanelFrameDashboardShell } from "panel-frame-ui";
import type {
  Actor,
  Media,
  Project,
  Role,
  WorkspaceDashboardResult,
  ContentListData,
} from "@/lib/types";
import { OrganizationSwitcher } from "./organization-switcher";
import { api, BrandContent, Icon, Notice, ThemeSwitch } from "./ui";
import { ContentList, Dashboard } from "./content-list";
import styles from "./workspace.module.css";

const Editor = dynamic(() => import("./editor"));
const MediaLibrary = dynamic(() => import("./media-library"));
const MediaDetails = dynamic(() => import("./media-details"));
const Members = dynamic(() =>
  import("./settings/members").then((module) => module.Members),
);
const IntegrationSettings = dynamic(() =>
  import("./settings/integration-settings").then(
    (module) => module.IntegrationSettings,
  ),
);
const navigation = [
  { id: "", label: "Overview", icon: "grid" },
  { id: "articles", label: "Articles", icon: "article" },
  { id: "media", label: "Media library", icon: "image" },
  { id: "documents", label: "JSON documents", icon: "code" },
];
export default function Workspace(
  props: ComponentProps<typeof WorkspaceContent>,
) {
  return (
    <NavigationGuardProvider>
      <WorkspaceContent {...props} />
    </NavigationGuardProvider>
  );
}
function WorkspaceContent({
  actor,
  role,
  project,
  view,
  initialMedia,
  initialMediaUrl,
  initialDashboard,
  previewContent,
  previewContentError,
  previewUnsaved,
  previewMediaScenario,
  previewInitialMediaQuery,
  previewRequest,
}: {
  actor: Actor;
  role: Role;
  project: Project;
  view: string[];
  initialMedia: Media | null;
  initialMediaUrl: string | null;
  initialDashboard: Promise<WorkspaceDashboardResult>;
  previewContent?: ContentListData;
  previewContentError?: string;
  previewUnsaved?: boolean;
  previewMediaScenario?: "uploading" | "failed";
  previewInitialMediaQuery?: string;
  previewRequest?: typeof api;
}) {
  const router = useRouter();
  const { confirmNavigation } = useNavigationGuard();
  const base = "/workspace/" + project.id;
  const tab = view[0] || "";
  const [error, setError] = useState("");
  const canEdit = role !== "viewer";

  return (
    <PanelFrameDashboardShell
      brand={<BrandContent />}
      sidebarContext={
        <Link href="/projects" className={styles.projectSwitch}>
          <span className={styles.projectAvatar}>{project.name[0]}</span>
          <span>
            <strong>{project.name}</strong>
            <small>Switch project</small>
          </span>
          <span className={styles.chevron}>
            <Icon name="chevron" size={16} />
          </span>
        </Link>
      }
      navigation={
        <>
          <div className="pf-sidebar-group">
            <p className="pf-sidebar-group-label">Workspace</p>
            <nav aria-label="Workspace">
              {navigation.map((item) => (
                <Link
                  aria-current={tab === item.id ? "page" : undefined}
                  className="pf-sidebar-link"
                  href={base + "/" + item.id}
                  key={item.id}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="pf-sidebar-group">
            <p className="pf-sidebar-group-label">Manage</p>
            {role === "admin" ? (
              <Link
                aria-current={tab === "members" ? "page" : undefined}
                className="pf-sidebar-link"
                href={base + "/members"}
              >
                <Icon name="users" size={18} />
                Members
              </Link>
            ) : null}
            <Link
              aria-current={tab === "settings" ? "page" : undefined}
              className="pf-sidebar-link"
              href={base + "/settings"}
            >
              <Icon name="settings" size={18} />
              Settings &amp; API
            </Link>
          </div>
        </>
      }
      sidebarFooter={
        <div className={styles.sidebarBottom}>
          <div className={styles.storageNote}>
            <span className={styles.onlineDot} />
            Your content, in your Space
          </div>
          <div className={styles.profile}>
            <span className={styles.userAvatar}>
              {actor.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{actor.username}</strong>
              <small>{role}</small>
            </div>
            <button
              aria-label="Log out"
              className={styles.iconButton}
              onClick={async () => {
                if (!(await confirmNavigation("Log out and discard"))) return;
                try {
                  await api("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              type="button"
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      }
      toolbar={
        <div className={styles.sharedToolbar}>
          <div className={styles.toolbarLocation}>
            <span>{project.name}</span>
            <span className={styles.breadcrumb}>/</span>
            <strong>
              {navigation.find((item) => item.id === tab)?.label ||
                (tab === "members" ? "Members" : "Settings")}
            </strong>
            {tab === "media" && initialMedia ? (
              <>
                <span className={styles.breadcrumb}>/</span>
                <strong title={initialMedia.filename}>{initialMedia.filename}</strong>
              </>
            ) : null}
          </div>
          <div className={styles.accountHeaderActions}>
            <OrganizationSwitcher
              key={actor.organizationId}
              actor={actor}
              onBeforeChange={() => confirmNavigation("Switch organization and discard")}
            />
            <span className={styles.projectType}>Content Workspace</span>
            <ThemeSwitch />
          </div>
        </div>
      }
      contentAsMain={false}
    >
      <main className={styles.main}>
        <Notice error={error} />
        {!tab && (
          <Dashboard
            key={project.id}
            projectId={project.id}
            username={actor.username}
            canEdit={canEdit}
            initialDashboard={initialDashboard}
          />
        )}
        {["articles", "documents"].includes(tab) &&
          (view[1] ? (
            <Editor
              key={tab + "/" + view[1]}
              kind={tab as "articles" | "documents"}
              id={view[1]}
              projectId={project.id}
              canEdit={canEdit}
              request={previewRequest}
              initialDirty={previewUnsaved}
            />
          ) : (
            <ContentList
              kind={tab as "articles" | "documents"}
              projectId={project.id}
              canEdit={canEdit}
              previewData={previewContent}
              previewError={previewContentError}
            />
          ))}
        {tab === "media" &&
          (initialMedia && initialMediaUrl ? (
            <MediaDetails
              key={initialMedia.id}
              projectId={project.id}
              media={initialMedia}
              previewUrl={initialMediaUrl}
              canEdit={canEdit}
              request={previewRequest}
            />
          ) : (
            <MediaLibrary
              projectId={project.id}
              canEdit={canEdit}
              request={previewRequest}
              previewUploadState={previewMediaScenario}
              previewInitialQuery={previewInitialMediaQuery}
            />
          ))}
        {tab === "members" ? (
          <Members projectId={project.id} request={previewRequest} />
        ) : null}
        {tab === "settings" ? (
          <IntegrationSettings
            projectId={project.id}
            organizationId={actor.organizationId}
            canAdmin={role === "admin"}
            request={previewRequest}
          />
        ) : null}
      </main>
      <footer className={styles.workspaceFooter}>
        <span>Your content, thoughtfully managed.</span>
        <span>postparticle</span>
      </footer>
    </PanelFrameDashboardShell>
  );
}

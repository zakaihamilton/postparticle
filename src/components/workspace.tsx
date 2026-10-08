"use client";
import {
  GuardedLink as Link,
  NavigationGuardProvider,
  useNavigationGuard,
} from "./navigation-guard";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import type { Actor, Project, Role } from "@/lib/types";
import { OrganizationSwitcher } from "./organization-switcher";
import { api, Brand, Icon, Notice, ThemeSwitch } from "./ui";
import { ContentList, Dashboard } from "./content-list";
import Editor from "./editor";
import MediaLibrary from "./media-library";
import { Members, IntegrationSettings } from "./settings";
import styles from "./workspace.module.css";
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
}: {
  actor: Actor;
  role: Role;
  project: Project;
  view: string[];
}) {
  const router = useRouter();
  const { confirmNavigation } = useNavigationGuard();
  const base = `/workspace/${project.id}`;
  const tab = view[0] || "";
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const canEdit = role !== "viewer";
  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${menu ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarBrand}>
          <Brand href="/projects" />
        </div>
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
        <div className={styles.navCaption}>WORKSPACE</div>
        <nav aria-label="Workspace">
          {navigation.map((n) => (
            <Link
              key={n.id}
              href={`${base}/${n.id}`}
              className={`${styles.navItem} ${tab === n.id ? styles.navActive : ""}`}
              onClick={() => setMenu(false)}
            >
              <Icon name={n.icon} size={18} />
              {n.label}
            </Link>
          ))}
          <div className={styles.navCaption}>MANAGE</div>
          {role === "admin" && (
            <Link
              href={`${base}/members`}
              className={`${styles.navItem} ${tab === "members" ? styles.navActive : ""}`}
            >
              <Icon name="users" size={18} />
              Members
            </Link>
          )}
          <Link
            href={`${base}/settings`}
            className={`${styles.navItem} ${tab === "settings" ? styles.navActive : ""}`}
          >
            <Icon name="settings" size={18} />
            Settings & API
          </Link>
        </nav>
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
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className={styles.contentArea}>
        <header className={styles.topbar}>
          <div>
            <button
              className={styles.mobileMenu}
              aria-label="Toggle workspace navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" size={20} />
            </button>
            <span>{project.name}</span>
            <span className={styles.breadcrumb}>/</span>
            <strong>
              {navigation.find((n) => n.id === tab)?.label ||
                (tab === "members" ? "Members" : "Settings")}
            </strong>
          </div>
          <div className={styles.topRight}>
            <OrganizationSwitcher
              actor={actor}
              onBeforeChange={() => confirmNavigation("Switch organization and discard")}
            />
            <span className={styles.projectType}>CONTENT WORKSPACE</span>
            <ThemeSwitch />
          </div>
        </header>
        <main className={styles.main}>
          <Notice error={error} />
          {!tab && (
            <Dashboard
              projectId={project.id}
              username={actor.username}
              canEdit={canEdit}
            />
          )}
          {["articles", "documents"].includes(tab) &&
            (view[1] ? (
              <Editor
                key={`${tab}/${view[1]}`}
                kind={tab as "articles" | "documents"}
                id={view[1]}
                projectId={project.id}
                canEdit={canEdit}
              />
            ) : (
              <ContentList
                kind={tab as "articles" | "documents"}
                projectId={project.id}
                canEdit={canEdit}
              />
            ))}
          {tab === "media" && (
            <MediaLibrary projectId={project.id} canEdit={canEdit} />
          )}
          {tab === "members" && <Members projectId={project.id} />}
          {tab === "settings" && <IntegrationSettings projectId={project.id} />}
        </main>
        <footer className={styles.workspaceFooter}>
          <span>Your content, thoughtfully managed.</span>
          <span>postparticle</span>
        </footer>
      </div>
    </div>
  );
}

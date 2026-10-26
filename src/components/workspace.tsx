"use client";
import {
  GuardedLink as Link,
  NavigationGuardProvider,
  useNavigationGuard,
} from "./navigation-guard";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import type { Actor, Project, Role } from "@/lib/types";
import { OrganizationSwitcher } from "./organization-switcher";
import { api, Brand, Icon, Notice, ThemeSwitch } from "./ui";
import { ContentList, Dashboard } from "./content-list";
import styles from "./workspace.module.css";

const Editor = dynamic(() => import("./editor"));
const MediaLibrary = dynamic(() => import("./media-library"));
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
  const [isMobile, setIsMobile] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const canEdit = role !== "viewer";

  function closeMenu(restoreFocus = false) {
    setMenu(false);
    if (restoreFocus && isMobile) menuButton.current?.focus();
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    function updateViewport() {
      setIsMobile(media.matches);
      if (!media.matches) setMenu(false);
    }
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!menu || !isMobile) return;
    const panel = sidebar.current;
    const selector =
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(selector) ?? []).filter(
        (element) => !element.hasAttribute("hidden"),
      );
    focusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(false);
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        target instanceof Element &&
        target.closest("[data-navigation-guard-overlay]")
      )
        return;
      if (!panel?.contains(target) && !menuButton.current?.contains(target)) {
        if (panel?.contains(document.activeElement))
          menuButton.current?.focus();
        setMenu(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMobile, menu]);

  return (
    <div className={styles.shell}>
      <aside
        ref={sidebar}
        id="workspace-sidebar"
        className={`${styles.sidebar} ${menu ? styles.sidebarOpen : ""}`}
        role={isMobile && menu ? "dialog" : undefined}
        aria-label={isMobile && menu ? "Workspace navigation" : undefined}
        aria-modal={isMobile && menu ? true : undefined}
        aria-hidden={isMobile && !menu ? true : undefined}
        inert={isMobile && !menu}
      >
        <div className={styles.sidebarBrand}>
          <Brand href="/projects" />
        </div>
        <Link
          href="/projects"
          className={styles.projectSwitch}
          onClick={() => closeMenu(true)}
        >
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
              onClick={() => closeMenu(true)}
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
              onClick={() => closeMenu(true)}
            >
              <Icon name="users" size={18} />
              Members
            </Link>
          )}
          <Link
            href={`${base}/settings`}
            className={`${styles.navItem} ${tab === "settings" ? styles.navActive : ""}`}
            onClick={() => closeMenu(true)}
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
                closeMenu(true);
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
      {isMobile && menu && (
        <button
          type="button"
          className={styles.sidebarBackdrop}
          aria-label="Close workspace navigation"
          tabIndex={-1}
          onClick={() => closeMenu(true)}
        />
      )}
      <div className={styles.contentArea}>
        <header className={styles.topbar}>
          <div>
            <button
              className={styles.mobileMenu}
              ref={menuButton}
              aria-label={`${menu ? "Close" : "Open"} workspace navigation`}
              aria-expanded={menu}
              aria-controls="workspace-sidebar"
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
              key={actor.organizationId}
              actor={actor}
              onBeforeChange={() =>
                confirmNavigation("Switch organization and discard")
              }
            />
            <span className={styles.projectType}>Content Workspace</span>
            <ThemeSwitch />
          </div>
        </header>
        <main className={styles.main}>
          <Notice error={error} />
          {!tab && (
            <Dashboard
              key={project.id}
              projectId={project.id}
              username={actor.username}
              canEdit={canEdit}
              canAdmin={role === "admin"}
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
          {tab === "settings" && (
            <IntegrationSettings
              projectId={project.id}
              organizationId={actor.organizationId}
            />
          )}
        </main>
        <footer className={styles.workspaceFooter}>
          <span>Your content, thoughtfully managed.</span>
          <span>postparticle</span>
        </footer>
      </div>
    </div>
  );
}

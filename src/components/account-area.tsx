"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Actor } from "@/lib/types";
import { OrganizationSwitcher } from "./organization-switcher";
import { api, Brand, Icon, Notice, ThemeSwitch } from "./ui";
import styles from "./workspace.module.css";

type AccountSection = "workspaces" | "account" | "platform-accounts";

export function AccountArea({
  actor,
  activeSection,
  children,
}: {
  actor: Actor;
  activeSection: AccountSection;
  children: ReactNode;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const title =
    activeSection === "workspaces"
      ? "Workspaces"
      : activeSection === "account"
        ? "Your account"
        : "Platform accounts";

  async function logout() {
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className={styles.shell}>
      <aside
        id="account-sidebar"
        className={`${styles.sidebar} ${menu ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.sidebarBrand}>
          <Brand href="/projects" />
        </div>
        <nav aria-label="Account and workspace navigation">
          <div className={styles.navCaption}>WORKSPACES</div>
          <Link
            href="/projects"
            aria-current={activeSection === "workspaces" ? "page" : undefined}
            className={`${styles.navItem} ${activeSection === "workspaces" ? styles.navActive : ""}`}
            onClick={() => setMenu(false)}
          >
            <Icon name="grid" size={18} />
            Workspaces
          </Link>
          <div className={styles.navCaption}>ACCOUNT</div>
          <Link
            href="/account"
            aria-current={activeSection === "account" ? "page" : undefined}
            className={`${styles.navItem} ${activeSection === "account" ? styles.navActive : ""}`}
            onClick={() => setMenu(false)}
          >
            <Icon name="settings" size={18} />
            Your account
          </Link>
          {actor.platformAdmin && (
            <Link
              href="/account/platform-accounts"
              aria-current={
                activeSection === "platform-accounts" ? "page" : undefined
              }
              className={`${styles.navItem} ${activeSection === "platform-accounts" ? styles.navActive : ""}`}
              onClick={() => setMenu(false)}
            >
              <Icon name="users" size={18} />
              Platform accounts
            </Link>
          )}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.profile}>
            <span className={styles.userAvatar}>
              {actor.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{actor.username}</strong>
              <small>
                {actor.platformAdmin ? "Platform administrator" : "Account"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className={styles.contentArea}>
        <header className={styles.topbar}>
          <div>
            <button
              className={styles.mobileMenu}
              aria-label="Toggle account navigation"
              aria-expanded={menu}
              aria-controls="account-sidebar"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" size={20} />
            </button>
            <strong>{title}</strong>
          </div>
          <div className={styles.accountHeaderActions}>
            <OrganizationSwitcher actor={actor} />
            <ThemeSwitch />
            <button
              className={styles.ghost}
              type="button"
              aria-label="Log out"
              onClick={logout}
            >
              <Icon name="logout" size={16} />
              <span className={styles.accountLogoutText}>Log out</span>
            </button>
          </div>
        </header>
        <main className={`${styles.main} ${styles.accountMain}`}>
          <Notice error={error} />
          {children}
        </main>
        <footer className={styles.workspaceFooter}>
          <span>Your content, thoughtfully managed.</span>
          <span>postparticle</span>
        </footer>
      </div>
    </div>
  );
}

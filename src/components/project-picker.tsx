"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Actor, Project, Role } from "@/lib/types";
import { api, Brand, Empty, Icon, Notice, ThemeSwitch } from "./ui";
import { AccountSettings } from "./settings";
import styles from "./workspace.module.css";
export default function ProjectPicker({
  actor,
  projects,
}: {
  actor: Actor;
  projects: (Project & { role: Role | null })[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  return (
    <div className={styles.pickerPage}>
      <header className={styles.pickerHeader}>
        <Brand />
        <div>
          <ThemeSwitch />
          <button
            className={styles.ghost}
            onClick={() => setSettings(!settings)}
          >
            Account
          </button>
          <button
            className={styles.ghost}
            onClick={async () => {
              try {
                await api("/api/auth/logout", { method: "POST" });
                router.push("/login");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className={styles.pickerMain}>
        <div className={styles.eyebrow}>YOUR WORKSPACES</div>
        <h1>Good to see you, {actor.username}.</h1>
        <p className={styles.subtitle}>
          Choose a project. Make something worth sharing.
        </p>
        <Notice error={error} />
        {settings ? (
          <AccountSettings platformAdmin={actor.platformAdmin} />
        ) : (
          <>
            <div className={styles.projectGrid}>
              {projects.map((p, i) => (
                <Link
                  key={p.id}
                  className={styles.projectCard}
                  href={`/workspace/${p.id}`}
                >
                  <div className={styles.projectCardTop}>
                    <span className={styles.projectAvatar}>
                      {p.name.slice(0, 1)}
                    </span>
                    <span className={styles.badge}>{p.role}</span>
                  </div>
                  <h2>{p.name}</h2>
                  <p>{p.description}</p>
                  <div className={styles.projectCardBottom}>
                    <span>Open workspace</span>
                    <Icon name="arrow" size={18} />
                  </div>
                  <span className={styles.projectNumber}>0{i + 1}</span>
                </Link>
              ))}
            </div>
            {!projects.length && (
              <Empty title="No projects yet">
                Your administrator can give you access to a project. Your
                account is ready.
              </Empty>
            )}
            <div className={styles.pickerNote}>
              <Icon name="lock" size={16} /> Only projects you have access to
              appear here.
            </div>
            {actor.platformAdmin && <AccountSettings platformAdmin />}
          </>
        )}
      </main>
    </div>
  );
}

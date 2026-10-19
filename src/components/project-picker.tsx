import Link from "next/link";
import type { Actor, Project, Role } from "@/lib/types";
import { AccountArea } from "./account-area";
import { Empty, Icon } from "./ui";
import styles from "./workspace.module.css";
export default function ProjectPicker({
  actor,
  projects,
}: {
  actor: Actor;
  projects: (Project & { role: Role | null })[];
}) {
  return (
    <AccountArea actor={actor} activeSection="workspaces">
      <div className={styles.pickerMain}>
        <div className={styles.eyebrow}>YOUR WORKSPACES</div>
        <h1>Good to see you, {actor.username}.</h1>
        <p className={styles.subtitle}>
          Choose a project to continue writing and publishing.
        </p>
        <Link className={styles.primary} href="/account/projects">
          Create a project
        </Link>
        <div className={styles.projectGrid}>
          {projects.map((p) => (
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
            </Link>
          ))}
        </div>
        {!projects.length && (
          <Empty title="No projects yet">
            Create a project for your organization to start writing and
            publishing.
          </Empty>
        )}
        <div className={styles.pickerNote}>
          <Icon name="lock" size={16} /> Projects are shared with your
          organization. Your role determines what you can do.
        </div>
      </div>
    </AccountArea>
  );
}

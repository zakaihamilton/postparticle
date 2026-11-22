import Link from "next/link";
import type { Actor, Project, Role } from "@/lib/types";
import { AccountArea } from "./account-area";
import pickerStyles from "./project-picker.module.css";
import { Empty, Icon } from "./ui";
import styles from "./workspace-primitives.module.css";
export default function ProjectPicker({
  actor,
  projects,
  onBeforeOrganizationChange,
}: {
  actor: Actor;
  projects: (Project & { role: Role | null })[];
  onBeforeOrganizationChange?: () => Promise<boolean>;
}) {
  return (
    <AccountArea
      actor={actor}
      activeSection="workspaces"
      onBeforeOrganizationChange={onBeforeOrganizationChange}
    >
      <div className={styles.pickerMain}>
        <div className={styles.eyebrow}>YOUR WORKSPACES</div>
        <h1>Good to see you, {actor.username}.</h1>
        <p className={styles.subtitle}>
          Choose a project to continue writing and publishing.
        </p>
        <Link className={styles.primary} href="/account/projects">
          Create a project
        </Link>
        <div className={pickerStyles.projectGrid}>
          {projects.map((p) => (
            <Link
              key={p.id}
              className={pickerStyles.projectCard}
              href={`/workspace/${p.id}`}
            >
              <div className={pickerStyles.projectCardTop}>
                <span className={styles.projectAvatar}>
                  {p.name.slice(0, 1)}
                </span>
                <span className={styles.badge}>{p.role}</span>
              </div>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              <div className={pickerStyles.projectCardBottom}>
                <span>Open workspace</span>
                <Icon name="arrow" size={18} />
              </div>
            </Link>
          ))}
        </div>
        {!projects.length && (
          <Empty title="No projects yet">
            Create a project for your organization, or ask an administrator to
            grant you access to an existing one.
          </Empty>
        )}
        <div className={pickerStyles.pickerNote}>
          <Icon name="lock" size={16} /> Only projects you have access to appear
          here.
        </div>
      </div>
    </AccountArea>
  );
}

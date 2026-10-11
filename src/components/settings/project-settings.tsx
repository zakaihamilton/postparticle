"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, Notice } from "../ui";
import styles from "../workspace.module.css";

interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  production: boolean;
  archived: boolean;
  deleting: boolean;
}

export function ProjectSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [typedId, setTypedId] = useState("");
  const deleteDialog = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api<{ projects: ProjectRecord[] }>(
        "/api/manage/projects/catalog",
        { cache: "no-store" },
      );
      setProjects(result.projects);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!deleteTarget) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    deleteDialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDeleteTarget(null);
      } else if (event.key === "Tab") {
        const controls = deleteDialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [deleteTarget]);

  async function run(task: () => Promise<void>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(async () => {
      await api("/api/manage/projects/catalog", {
        method: "POST",
        body: JSON.stringify({
          id: data.get("id"),
          name: data.get("name"),
          description: data.get("description"),
          production: data.get("production") === "on",
        }),
      });
      form.reset();
      setMessage("Project created.");
      await refresh();
    });
  }

  async function updateProject(
    projectId: string,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(async () => {
      const result = await api<{ project: ProjectRecord }>(
        `/api/manage/projects/catalog/${encodeURIComponent(projectId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: data.get("name"),
            description: data.get("description"),
            production: data.get("production") === "on",
          }),
        },
      );
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? result.project : project,
        ),
      );
      setMessage(`Saved ${projectId}.`);
    });
  }

  async function setArchived(project: ProjectRecord, archived: boolean) {
    await run(async () => {
      const result = await api<{ project: ProjectRecord }>(
        `/api/manage/projects/catalog/${encodeURIComponent(project.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ archived }),
        },
      );
      setProjects((current) =>
        current.map((item) => (item.id === project.id ? result.project : item)),
      );
      setMessage(
        archived ? `${project.name} archived.` : `${project.name} restored.`,
      );
    });
  }

  function openDelete(project: ProjectRecord) {
    setTypedId("");
    setDeleteTarget(project);
  }

  async function confirmDelete() {
    if (!deleteTarget || typedId !== deleteTarget.id || busy) return;
    const project = deleteTarget;
    setError("");
    setMessage("");
    setBusy(true);
    setDeleteTarget(null);
    try {
      let done = false;
      let deleted = 0;
      while (!done) {
        const result = await api<{
          done: boolean;
          deletedObjects: number;
          retryAfterMs?: number;
        }>(
          `/api/manage/projects/catalog/${encodeURIComponent(project.id)}`,
          {
            method: "DELETE",
            body: JSON.stringify({
              confirmation: project.id,
              organizationId,
            }),
          },
        );
        done = result.done;
        deleted += result.deletedObjects;
        if (!done && result.retryAfterMs) {
          setMessage(
            `Project access is blocked. Waiting for existing upload links to expire…`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, result.retryAfterMs),
          );
        } else if (!done) {
          setMessage(
            `Removing ${project.name} data… ${deleted} objects removed.`,
          );
        }
      }
      setMessage(
        `${project.name} and its stored data were permanently deleted.`,
      );
      await refresh();
    } catch (e) {
      const deletionError = (e as Error).message;
      await refresh();
      setError(deletionError);
      setMessage(
        `Deletion could not be confirmed. If ${project.name} remains listed as deleting, retry to resume cleanup.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>PLATFORM ADMINISTRATION</div>
          <h1>Projects</h1>
          <p className={styles.subtitle}>
            Manage projects for the active organization. Project IDs cannot be
            changed.
          </p>
        </div>
      </div>
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Create a project</h2>
            <p>New projects are visible in production by default.</p>
          </div>
        </div>
        <form className={styles.formSection} onSubmit={createProject}>
          <label>
            Project ID
            <input
              name="id"
              required
              pattern="[a-z0-9][a-z0-9_-]{0,79}"
              maxLength={80}
              autoCapitalize="none"
              autoCorrect="off"
              disabled={busy}
            />
            <small>Lowercase letters, numbers, hyphens, and underscores.</small>
            <small>IDs of permanently deleted projects stay retired.</small>
          </label>
          <label>
            Name
            <input name="name" required maxLength={120} disabled={busy} />
          </label>
          <label>
            Description
            <textarea
              name="description"
              maxLength={1000}
              rows={3}
              disabled={busy}
            />
          </label>
          <label className={styles.projectProductionToggle}>
            <input
              name="production"
              type="checkbox"
              defaultChecked
              disabled={busy}
            />
            Visible in production
          </label>
          <button className={styles.primary} disabled={busy}>
            Create project
          </button>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Project registry</h2>
            <p>
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </p>
          </div>
          <button
            className={styles.ghost}
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className={styles.tableFooter}>Loading projects…</p>
        ) : projects.length ? (
          <div className={styles.accountList}>
            {projects.map((project) => (
              <article className={styles.accountUser} key={project.id}>
                <div className={styles.accountUserTop}>
                  <div className={styles.accountUserIdentity}>
                    <strong>{project.name}</strong>
                    <small>ID: {project.id}</small>
                    <small>
                      {project.deleting
                        ? "Deletion in progress"
                        : project.archived
                          ? "Archived"
                          : project.production
                            ? "Active · visible in production"
                            : "Active · excluded from production"}
                    </small>
                  </div>
                  <div className={styles.accountUserActions}>
                    {project.deleting ? (
                      <button
                        className={styles.dangerButton}
                        disabled={busy}
                        onClick={() => openDelete(project)}
                      >
                        Resume deletion
                      </button>
                    ) : project.archived ? (
                      <>
                        <button
                          className={styles.secondary}
                          disabled={busy}
                          onClick={() => void setArchived(project, false)}
                        >
                          Restore project
                        </button>
                        <button
                          className={styles.dangerButton}
                          disabled={busy}
                          onClick={() => openDelete(project)}
                        >
                          Delete permanently
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => void setArchived(project, true)}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
                {!project.deleting && (
                  <form
                    className={styles.projectEditForm}
                    onSubmit={(event) => void updateProject(project.id, event)}
                  >
                    <label>
                      Name
                      <input
                        name="name"
                        required
                        maxLength={120}
                        defaultValue={project.name}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        name="description"
                        rows={2}
                        maxLength={1000}
                        defaultValue={project.description}
                        disabled={busy}
                      />
                    </label>
                    <label className={styles.projectProductionToggle}>
                      <input
                        name="production"
                        type="checkbox"
                        defaultChecked={project.production}
                        disabled={busy}
                      />
                      Visible in production
                    </label>
                    <button className={styles.secondary} disabled={busy}>
                      Save changes
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.tableFooter}>
            No projects are registered for this organization.
          </p>
        )}
      </section>

      {deleteTarget && (
        <div className={styles.projectDeleteOverlay}>
          <button
            type="button"
            className={styles.projectDeleteBackdrop}
            aria-label="Cancel project deletion"
            onClick={() => setDeleteTarget(null)}
          />
          <section
            ref={deleteDialog}
            className={styles.projectDeleteDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="project-delete-title"
            aria-describedby="project-delete-description project-delete-cache-note project-delete-uploads-note"
          >
            <h2 id="project-delete-title">
              Permanently delete {deleteTarget.name}?
            </h2>
            <p id="project-delete-description">
              This removes the project and all of its stored content and media
              from S3, revokes its explicit project grants, and stops its API
              responses. Its project ID will stay retired. This cannot be
              undone.
            </p>
            <p id="project-delete-cache-note">
              Published media already cached by a CDN may remain available until
              that cache expires.
            </p>
            <p id="project-delete-uploads-note">
              Existing upload links remain valid briefly. Cleanup waits for them
              to expire, so deletion can take about six minutes to begin.
            </p>
            <label>
              Type <code>{deleteTarget.id}</code> to confirm
              <input
                value={typedId}
                onChange={(event) => setTypedId(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <div className={styles.projectDeleteActions}>
              <button
                className={styles.secondary}
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                disabled={typedId !== deleteTarget.id || busy}
                onClick={() => void confirmDelete()}
              >
                {deleteTarget.deleting
                  ? "Resume deletion"
                  : "Delete project and data"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

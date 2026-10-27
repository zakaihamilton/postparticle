"use client";

import { useState, type FormEvent } from "react";
import { api, Notice } from "../ui";
import styles from "../workspace.module.css";

export function ProjectCreationForm({
  isPlatformAdmin = false,
  onCreated,
  request = api,
}: {
  isPlatformAdmin?: boolean;
  onCreated?: () => Promise<void>;
  request?: typeof api;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await request("/api/manage/projects/catalog", {
        method: "POST",
        body: JSON.stringify({
          id: data.get("id"),
          name: data.get("name"),
          description: data.get("description"),
          production: isPlatformAdmin ? data.get("production") === "on" : true,
        }),
      });
      form.reset();
      setMessage("Project created. You can open it from Workspaces.");
      await onCreated?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
          {isPlatformAdmin && (
            <label className={styles.projectProductionToggle}>
              <input
                name="production"
                type="checkbox"
                defaultChecked
                disabled={busy}
              />
              Visible in production
            </label>
          )}
          <button className={styles.primary} disabled={busy}>
            Create project
          </button>
        </form>
      </section>
    </>
  );
}

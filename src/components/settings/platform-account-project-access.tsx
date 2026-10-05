"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import { api, Notice } from "../ui";
import Select from "../select";
import styles from "../workspace.module.css";

type ProjectAccess = {
  id: string;
  name: string;
  description: string;
  role: Role | null;
};

export function PlatformAccountProjectAccess({
  username,
}: {
  username: string;
}) {
  const [projects, setProjects] = useState<ProjectAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint =
    "/api/manage/users/" + encodeURIComponent(username) + "/projects";

  useEffect(() => {
    let active = true;
    api<{ projects: ProjectAccess[] }>(endpoint)
      .then((result) => {
        if (active) setProjects(result.projects);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  async function updateRole(projectId: string, role: Role | null) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify({ projectId, role }),
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, role } : project,
        ),
      );
      const project = projects.find((item) => item.id === projectId);
      setMessage(
        project
          ? project.name + " access updated for " + username + "."
          : "Project access updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.accountProjectAccess}>
      <h3>Project access</h3>
      <p>Changes save as soon as you choose a role.</p>
      <Notice error={error} message={message} />
      {loading ? (
        <p>Loading project access…</p>
      ) : projects.length ? (
        <div className={styles.projectAccessList}>
          {projects.map((project) => (
            <div className={styles.projectAccessItem} key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <small>{project.description}</small>
              </div>
              <Select
                label={"Project role for " + username + " in " + project.name}
                disabled={busy}
                value={project.role ?? "none"}
                onValueChange={(value) =>
                  void updateRole(
                    project.id,
                    value === "none" ? null : (value as Role),
                  )
                }
                options={[
                  { value: "none", label: "No access" },
                  { value: "viewer", label: "Viewer" },
                  { value: "editor", label: "Editor" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            </div>
          ))}
        </div>
      ) : (
        !loading &&
        (error ? (
          <p>Project access could not be loaded.</p>
        ) : (
          <p>No projects are configured for this deployment.</p>
        ))
      )}
    </section>
  );
}

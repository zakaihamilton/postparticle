"use client";
import { useEffect, useState } from "react";
import { api, Notice } from "../ui";
import type { Role } from "@/lib/types";
import styles from "../workspace.module.css";
import Select from "../select";
type Member = {
  username: string;
  disabled: boolean;
  accessActive?: boolean;
  role: Role | null;
};

export function Members({
  projectId,
  request = api,
}: {
  projectId: string;
  request?: typeof api;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addRole, setAddRole] = useState<Role>("viewer");
  const endpoint = `/api/manage/projects/${projectId}/members`;
  useEffect(() => {
    let active = true;
    request<Member[]>(endpoint)
      .then((m) => {
        if (active) setMembers(m);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint, request]);
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>BETTER, TOGETHER</div>
          <h1>Project members</h1>
          <p className={styles.subtitle}>
            Give each person the right space to create.
          </p>
        </div>
      </div>
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        <form
          className={styles.formSection}
          onSubmit={async (event) => {
            event.preventDefault();
            const username = addUsername.trim().toLowerCase();
            if (!username) return;
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await request(endpoint, {
                method: "POST",
                body: JSON.stringify({ username, role: addRole }),
              });
              setMembers(await request<Member[]>(endpoint));
              setAddUsername("");
              setMessage("Project access updated.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className={styles.twoColumns}>
            <label>
              Existing account username
              <input
                value={addUsername}
                onChange={(event) => setAddUsername(event.target.value)}
                autoComplete="off"
                maxLength={254}
                aria-label="Existing account username"
                placeholder="Username or email address"
              />
            </label>
            <label>
              Project role
              <Select
                label="Role to grant"
                value={addRole}
                disabled={busy}
                onValueChange={(value) => setAddRole(value as Role)}
                options={[
                  { value: "viewer", label: "Viewer" },
                  { value: "editor", label: "Editor" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            </label>
          </div>
          <button
            className={styles.secondary}
            disabled={busy || !addUsername.trim()}
          >
            Grant project access
          </button>
        </form>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ACCOUNT</th>
                <th>STATUS</th>
                <th>PROJECT ROLE</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.username}>
                  <td>
                    <strong>{m.username}</strong>
                  </td>
                  <td>
                    {m.disabled
                      ? "Disabled"
                      : m.accessActive === false
                        ? "Inactive"
                        : "Active"}
                  </td>
                  <td>
                    <Select
                      label={`Role for ${m.username}`}
                      disabled={busy}
                      value={m.role || "none"}
                      onValueChange={async (value) => {
                        setBusy(true);
                        setError("");
                        const role = value === "none" ? null : (value as Role);
                        try {
                          await request(endpoint, {
                            method: "POST",
                            body: JSON.stringify({
                              username: m.username,
                              role,
                            }),
                          });
                          setMembers((current) =>
                            current.map((u) =>
                              u.username === m.username
                                ? { ...u, role, accessActive: role !== null }
                                : u,
                            ),
                          );
                          setMessage("Project access updated.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      options={[
                        { value: "none", label: "No access" },
                        { value: "viewer", label: "Viewer" },
                        { value: "editor", label: "Editor" },
                        { value: "admin", label: "Admin" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.tableFooter}>
          Accounts are created by a platform administrator.
        </div>
      </section>
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import { GuardedLink as Link } from "./navigation-guard";
import { useRouter } from "next/navigation";
import { api, Notice } from "./ui";
import type { Role } from "@/lib/types";
import styles from "./workspace.module.css";
import Select from "./select";
type Member = { username: string; disabled: boolean; role: Role | null };
export function Members({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/manage/projects/${projectId}/members`;
  useEffect(() => {
    let active = true;
    api<Member[]>(endpoint)
      .then((m) => {
        if (active) setMembers(m);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);
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
                  <td>{m.disabled ? "Disabled" : "Active"}</td>
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
                          await api(endpoint, {
                            method: "POST",
                            body: JSON.stringify({
                              username: m.username,
                              role,
                            }),
                          });
                          setMembers(
                            members.map((u) =>
                              u.username === m.username ? { ...u, role } : u,
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
export function IntegrationSettings({ projectId }: { projectId: string }) {
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>YOUR CONTENT, EVERYWHERE</div>
          <h1>Settings & API</h1>
          <p className={styles.subtitle}>
            Connect your workspace to whatever you’re building.
          </p>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Published content API</h2>
          <span className={styles.badge}>v1</span>
        </div>
        <div className={styles.formSection}>
          <p className={styles.subtitle}>
            These endpoints are public and return published content only. Fetch
            them on your website’s server to render content and SEO metadata.
          </p>
          {[
            `/api/v1/projects/${projectId}/articles?q=&tag=&order=desc&page=1&pageSize=12`,
            `/api/v1/projects/${projectId}/articles/{slug}`,
            `/api/v1/projects/${projectId}/documents/{key}`,
          ].map((url) => (
            <pre className={styles.codeBlock} key={url}>
              GET {url}
            </pre>
          ))}
          <p className={styles.subtitle}>
            <Link href="/developers">Read the Next.js developer guides</Link>{" "}
            for copyable examples, search metadata, and the runnable blog. A
            60-second revalidation interval is a good starting point.
          </p>
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Project storage</h2>
        </div>
        <div className={styles.formSection}>
          <p className={styles.subtitle}>
            Storage credentials are configured through server-only environment
            variables. Ask your deployment administrator to change them. Drafts
            and originals are private; published media has public delivery
            copies.
          </p>
        </div>
      </section>
    </>
  );
}
export function AccountSettings({ platformAdmin }: { platformAdmin: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<
    { username: string; platformAdmin: boolean; disabled: boolean }[]
  >([]);
  const [showUsers, setShowUsers] = useState(false);
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
  return (
    <>
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Your account</h2>
        </div>
        <form
          className={styles.formSection}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void run(async () => {
              await api("/api/auth/password", {
                method: "POST",
                body: JSON.stringify({
                  currentPassword: data.get("currentPassword"),
                  password: data.get("password"),
                }),
              });
              router.push("/login");
              router.refresh();
            });
          }}
        >
          <div className={styles.twoColumns}>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
          </div>
          <small>
            At least 12 characters. Changing your password signs out all your
            sessions.
          </small>
          <button className={styles.secondary} disabled={busy}>
            Change password
          </button>
        </form>
      </section>
      {platformAdmin && (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>Platform accounts</h2>
            <button
              className={styles.ghost}
              onClick={() =>
                run(async () => {
                  setUsers(await api("/api/manage/users"));
                  setShowUsers(!showUsers);
                })
              }
            >
              {showUsers ? "Hide accounts" : "Manage accounts"}
            </button>
          </div>
          {showUsers && (
            <>
              <form
                className={styles.formSection}
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  void run(async () => {
                    await api("/api/manage/users", {
                      method: "POST",
                      body: JSON.stringify({
                        username: data.get("username"),
                        password: data.get("password"),
                      }),
                    });
                    setUsers(await api("/api/manage/users"));
                    form.reset();
                    setMessage(
                      "Account created. Grant project access in Members.",
                    );
                  });
                }}
              >
                <div className={styles.twoColumns}>
                  <label>
                    New username
                    <input
                      name="username"
                      required
                      pattern="[a-z0-9][a-z0-9_-]{0,79}"
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Initial password
                    <input
                      type="password"
                      name="password"
                      minLength={12}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <button className={styles.primary} disabled={busy}>
                  Create account
                </button>
              </form>
              <div className={styles.history}>
                {users.map((u) => (
                  <div key={u.username}>
                    <span>
                      <strong>{u.username}</strong>
                      <small>
                        {u.platformAdmin
                          ? "Platform administrator"
                          : u.disabled
                            ? "Disabled"
                            : "Active"}
                      </small>
                    </span>
                    <div className={styles.buttonGroup}>
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(
                              `/api/manage/users/${u.username}/revoke`,
                              { method: "POST" },
                            );
                            setMessage("All sessions revoked.");
                          })
                        }
                      >
                        Revoke sessions
                      </button>
                      {!u.platformAdmin && (
                        <button
                          className={styles.secondary}
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(`/api/manage/users/${u.username}`, {
                                method: "PATCH",
                                body: JSON.stringify({ disabled: !u.disabled }),
                              });
                              setUsers(await api("/api/manage/users"));
                            })
                          }
                        >
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <form
                className={styles.formSection}
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  void run(async () => {
                    await api(`/api/manage/users/${data.get("username")}`, {
                      method: "PATCH",
                      body: JSON.stringify({ password: data.get("password") }),
                    });
                    form.reset();
                    setMessage(
                      "Password reset. All previous sessions were revoked.",
                    );
                  });
                }}
              >
                <h3>Reset an account password</h3>
                <div className={styles.twoColumns}>
                  <label>
                    Username
                    <input name="username" required />
                  </label>
                  <label>
                    New password
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </div>
                <button className={styles.secondary} disabled={busy}>
                  Reset password
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}

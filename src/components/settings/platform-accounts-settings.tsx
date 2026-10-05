"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Notice } from "../ui";
import styles from "../workspace.module.css";
import { PlatformAccountProjectAccess } from "./platform-account-project-access";

type PlatformUser = {
  username: string;
  platformAdmin: boolean;
  disabled: boolean;
};

export function PlatformAccountsSettings({
  currentUsername,
}: {
  currentUsername: string;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyUsername, setBusyUsername] = useState("");
  const [expandedUsername, setExpandedUsername] = useState("");

  useEffect(() => {
    let active = true;
    api<PlatformUser[]>("/api/manage/users")
      .then((accounts) => {
        if (active) setUsers(accounts);
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
  }, []);

  function refreshUsers() {
    setError("");
    setLoading(true);
    api<PlatformUser[]>("/api/manage/users")
      .then(setUsers)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }

  async function run(username: string, task: () => Promise<void>) {
    setError("");
    setMessage("");
    setBusyUsername(username);
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyUsername("");
    }
  }

  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>PLATFORM ADMINISTRATION</div>
          <h1>Users</h1>
          <p className={styles.subtitle}>
            Manage account status and project access.
          </p>
        </div>
        <Link
          className={styles.primary}
          href="/account/platform-accounts/create"
        >
          Create account
        </Link>
      </div>
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Platform users</h2>
            <p>
              {users.length} {users.length === 1 ? "account" : "accounts"}
            </p>
          </div>
          <button
            className={styles.ghost}
            disabled={loading || !!busyUsername}
            onClick={refreshUsers}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className={styles.tableFooter}>Loading accounts…</p>
        ) : error && !users.length ? (
          <p className={styles.tableFooter}>
            The account list could not be loaded.
          </p>
        ) : users.length ? (
          <div className={styles.accountList}>
            {users.map((user) => {
              const isSelf = user.username === currentUsername;
              return (
                <article className={styles.accountUser} key={user.username}>
                  <div className={styles.accountUserTop}>
                    <div className={styles.accountUserIdentity}>
                      <strong>{user.username}</strong>
                      <small>
                        {user.platformAdmin
                          ? "Platform administrator"
                          : user.disabled
                            ? "Disabled"
                            : "Active"}
                      </small>
                      {user.platformAdmin && (
                        <small>Admin access to every project</small>
                      )}
                    </div>
                    <div className={styles.accountUserActions}>
                      {!user.platformAdmin && (
                        <button
                          className={styles.secondary}
                          aria-expanded={expandedUsername === user.username}
                          onClick={() =>
                            setExpandedUsername((current) =>
                              current === user.username ? "" : user.username,
                            )
                          }
                        >
                          {expandedUsername === user.username
                            ? "Close project access"
                            : "Manage project access"}
                        </button>
                      )}
                      {isSelf ? (
                        <Link className={styles.secondary} href="/account">
                          Your password settings
                        </Link>
                      ) : (
                        <Link
                          className={styles.secondary}
                          href={
                            "/account/platform-accounts/reset-password?username=" +
                            encodeURIComponent(user.username)
                          }
                        >
                          Reset password
                        </Link>
                      )}
                      <button
                        className={styles.secondary}
                        disabled={!!busyUsername}
                        onClick={() =>
                          run(user.username, async () => {
                            await api(
                              "/api/manage/users/" +
                                encodeURIComponent(user.username) +
                                "/revoke",
                              { method: "POST" },
                            );
                            setMessage(
                              "Revoked all sessions for " + user.username + ".",
                            );
                          })
                        }
                      >
                        Revoke sessions
                      </button>
                      {!user.platformAdmin && (
                        <button
                          className={styles.secondary}
                          disabled={!!busyUsername}
                          onClick={() =>
                            run(user.username, async () => {
                              await api(
                                "/api/manage/users/" +
                                  encodeURIComponent(user.username),
                                {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    disabled: !user.disabled,
                                  }),
                                },
                              );
                              setUsers((current) =>
                                current.map((account) =>
                                  account.username === user.username
                                    ? { ...account, disabled: !user.disabled }
                                    : account,
                                ),
                              );
                              setMessage(
                                user.disabled
                                  ? "Enabled " + user.username + "."
                                  : "Disabled " + user.username + ".",
                              );
                            })
                          }
                        >
                          {user.disabled ? "Enable" : "Disable"}
                        </button>
                      )}
                    </div>
                  </div>
                  {expandedUsername === user.username &&
                    !user.platformAdmin && (
                      <PlatformAccountProjectAccess username={user.username} />
                    )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className={styles.tableFooter}>No accounts found.</p>
        )}
      </section>
    </>
  );
}

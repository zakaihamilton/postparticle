"use client";
import { useId, useState } from "react";
import { api, Notice } from "../ui";
import {
  clearFieldError,
  FieldError,
  validateForm,
  type FieldErrors,
} from "../form-validation";
import styles from "../workspace.module.css";
export function PlatformAccountsSettings() {
  const createValidationId = useId().replace(/:/g, "");
  const resetValidationId = useId().replace(/:/g, "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [createFieldErrors, setCreateFieldErrors] = useState<FieldErrors>({});
  const [resetFieldErrors, setResetFieldErrors] = useState<FieldErrors>({});
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
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>PLATFORM ADMINISTRATION</div>
          <h1>Platform accounts</h1>
          <p className={styles.subtitle}>
            Create accounts and manage access to the platform.
          </p>
        </div>
      </div>
      <Notice error={error} message={message} />
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
              noValidate
              className={styles.formSection}
              onChange={(event) => {
                if (event.target instanceof HTMLInputElement)
                  clearFieldError(setCreateFieldErrors, event.target.name);
              }}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const validation = validateForm(form);
                setCreateFieldErrors(validation.errors);
                if (validation.firstInvalid) {
                  requestAnimationFrame(() => validation.firstInvalid?.focus());
                  return;
                }
                const data = new FormData(form);
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
                    placeholder="Username or email address"
                    maxLength={254}
                    autoComplete="off"
                    aria-label="New username"
                    aria-invalid={createFieldErrors.username ? true : undefined}
                    aria-describedby={
                      createFieldErrors.username
                        ? `${createValidationId}-username-error`
                        : undefined
                    }
                  />
                  <FieldError
                    id={`${createValidationId}-username-error`}
                    message={createFieldErrors.username}
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
                    aria-label="Initial password"
                    aria-invalid={createFieldErrors.password ? true : undefined}
                    aria-describedby={
                      createFieldErrors.password
                        ? `${createValidationId}-password-error`
                        : undefined
                    }
                  />
                  <FieldError
                    id={`${createValidationId}-password-error`}
                    message={createFieldErrors.password}
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
                            `/api/manage/users/${encodeURIComponent(u.username)}/revoke`,
                            {
                              method: "POST",
                            },
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
                            await api(
                              `/api/manage/users/${encodeURIComponent(u.username)}`,
                              {
                                method: "PATCH",
                                body: JSON.stringify({ disabled: !u.disabled }),
                              },
                            );
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
              noValidate
              className={styles.formSection}
              onChange={(event) => {
                if (event.target instanceof HTMLInputElement)
                  clearFieldError(setResetFieldErrors, event.target.name);
              }}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const validation = validateForm(form);
                setResetFieldErrors(validation.errors);
                if (validation.firstInvalid) {
                  requestAnimationFrame(() => validation.firstInvalid?.focus());
                  return;
                }
                const data = new FormData(form);
                void run(async () => {
                  await api(
                    `/api/manage/users/${encodeURIComponent(String(data.get("username")))}`,
                    {
                      method: "PATCH",
                      body: JSON.stringify({ password: data.get("password") }),
                    },
                  );
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
                  <input
                    name="username"
                    required
                    aria-label="Username"
                    aria-invalid={resetFieldErrors.username ? true : undefined}
                    aria-describedby={
                      resetFieldErrors.username
                        ? `${resetValidationId}-username-error`
                        : undefined
                    }
                  />
                  <FieldError
                    id={`${resetValidationId}-username-error`}
                    message={resetFieldErrors.username}
                  />
                </label>
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    autoComplete="new-password"
                    required
                    aria-label="New password"
                    aria-invalid={resetFieldErrors.password ? true : undefined}
                    aria-describedby={
                      resetFieldErrors.password
                        ? `${resetValidationId}-password-error`
                        : undefined
                    }
                  />
                  <FieldError
                    id={`${resetValidationId}-password-error`}
                    message={resetFieldErrors.password}
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
    </>
  );
}

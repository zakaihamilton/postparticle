"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { api, Notice } from "../ui";
import Select from "../select";
import {
  clearFieldError,
  FieldError,
  validateForm,
  type FieldErrors,
} from "../form-validation";
import styles from "../workspace.module.css";

type PlatformUser = {
  username: string;
  platformAdmin: boolean;
  disabled: boolean;
};

export function ResetPlatformAccountPassword({
  currentUsername,
  initialUsername,
  minimumPasswordLength,
}: {
  currentUsername: string;
  initialUsername: string;
  minimumPasswordLength: number;
}) {
  const validationId = useId().replace(/:/g, "");
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [username, setUsername] = useState(initialUsername);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const resettableUsers = users.filter(
    (user) => user.username !== currentUsername,
  );

  useEffect(() => {
    let active = true;
    api<PlatformUser[]>("/api/manage/users")
      .then((accounts) => {
        if (!active) return;
        setUsers(accounts);
        setUsername((current) =>
          accounts.some(
            (user) =>
              user.username === current && user.username !== currentUsername,
          )
            ? current
            : "",
        );
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => {
      active = false;
    };
  }, [currentUsername]);

  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>PLATFORM ADMINISTRATION</div>
          <h1>Reset an account password</h1>
          <p className={styles.subtitle}>
            Resetting a password revokes all existing sessions for that account.
          </p>
        </div>
        <Link className={styles.secondary} href="/account/platform-accounts">
          View users
        </Link>
      </div>
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        {resettableUsers.length ? (
          <form
            noValidate
            className={styles.formSection}
            onChange={(event) => {
              if (event.target instanceof HTMLInputElement)
                clearFieldError(setFieldErrors, event.target.name);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              setMessage("");
              const form = event.currentTarget;
              const validation = validateForm(form);
              setFieldErrors(validation.errors);
              if (!username) {
                setError("Choose an account to reset.");
                return;
              }
              if (validation.firstInvalid) {
                requestAnimationFrame(() => validation.firstInvalid?.focus());
                return;
              }
              const data = new FormData(form);
              setBusy(true);
              void api("/api/manage/users/" + encodeURIComponent(username), {
                method: "PATCH",
                body: JSON.stringify({ password: data.get("password") }),
              })
                .then(() => {
                  form.reset();
                  setMessage(
                    "Password reset. All previous sessions were revoked.",
                  );
                })
                .catch((e) => setError((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Account
              <Select
                label="Account to reset"
                disabled={loadingUsers || busy}
                value={username}
                onValueChange={(value) => {
                  setUsername(value);
                  setError("");
                }}
                options={[
                  { value: "", label: "Choose an account" },
                  ...resettableUsers.map((user) => ({
                    value: user.username,
                    label:
                      user.username +
                      (user.disabled ? " · Disabled" : "") +
                      (user.platformAdmin ? " · Platform administrator" : ""),
                  })),
                ]}
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                minLength={minimumPasswordLength}
                autoComplete="new-password"
                required
                aria-label="New password"
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={
                  fieldErrors.password
                    ? validationId + "-password-error"
                    : undefined
                }
              />
              <FieldError
                id={validationId + "-password-error"}
                message={fieldErrors.password}
              />
            </label>
            <button className={styles.primary} disabled={busy || loadingUsers}>
              Reset password
            </button>
          </form>
        ) : loadingUsers ? (
          <p className={styles.tableFooter}>Loading accounts…</p>
        ) : error ? (
          <p className={styles.tableFooter}>
            The account list could not be loaded.
          </p>
        ) : (
          <p className={styles.tableFooter}>
            There are no other accounts whose password you can reset.
          </p>
        )}
      </section>
    </>
  );
}

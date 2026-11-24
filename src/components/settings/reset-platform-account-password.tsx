"use client";

import { useEffect, useState } from "react";
import { validateForm } from "../form-validation";
import Select from "../select";
import { api, Notice } from "../ui";
import styles from "../workspace-primitives.module.css";
import {
  PasswordField,
  PlatformAdminHeading,
  useSettingsFeedback,
  useValidatedForm,
} from "./settings-helpers";

type PlatformUser = {
  username: string;
  platformAdmin: boolean;
  disabled: boolean;
};

export function ResetPlatformAccountPassword({
  currentUsername,
  initialUsername,
  minimumPasswordLength,
  request = api,
}: {
  currentUsername: string;
  initialUsername: string;
  minimumPasswordLength: number;
  request?: typeof api;
}) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [username, setUsername] = useState(initialUsername);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const { error, setError, message, setMessage, busy, setBusy } =
    useSettingsFeedback();
  const { validationId, fieldErrors, setFieldErrors, handleFormChange } =
    useValidatedForm();
  const resettableUsers = users.filter(
    (user) => user.username !== currentUsername,
  );

  useEffect(() => {
    let active = true;
    request<PlatformUser[]>("/api/manage/users")
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
  }, [currentUsername, request, setError]);

  return (
    <>
      <PlatformAdminHeading
        title="Reset an account password"
        subtitle="Resetting a password revokes all existing sessions for that account."
      />
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        {resettableUsers.length ? (
          <form
            noValidate
            className={styles.formSection}
            onChange={handleFormChange}
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
              void request(
                "/api/manage/users/" + encodeURIComponent(username),
                {
                  method: "PATCH",
                  body: JSON.stringify({ password: data.get("password") }),
                },
              )
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
            <PasswordField
              validationId={validationId}
              label="New password"
              minLength={minimumPasswordLength}
              error={fieldErrors.password}
            />
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

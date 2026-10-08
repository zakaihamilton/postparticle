"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { api, Notice } from "../ui";
import {
  clearFieldError,
  FieldError,
  validateForm,
  type FieldErrors,
} from "../form-validation";
import styles from "../workspace.module.css";

export function CreatePlatformAccountSettings({
  minimumPasswordLength,
}: {
  minimumPasswordLength: number;
}) {
  const validationId = useId().replace(/:/g, "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>PLATFORM ADMINISTRATION</div>
          <h1>Create account</h1>
          <p className={styles.subtitle}>
            New accounts start with no project access. Assign access from the
            users list.
          </p>
        </div>
        <Link className={styles.secondary} href="/account/platform-accounts">
          View users
        </Link>
      </div>
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        <form
          noValidate
          className={styles.formSection}
          onChange={(event) => {
            if (event.target instanceof HTMLInputElement)
              clearFieldError(setFieldErrors, event.target.name);
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const validation = validateForm(form);
            setFieldErrors(validation.errors);
            setError("");
            setMessage("");
            if (validation.firstInvalid) {
              requestAnimationFrame(() => validation.firstInvalid?.focus());
              return;
            }
            const data = new FormData(form);
            setBusy(true);
            void api<{ created?: boolean }>("/api/manage/users", {
              method: "POST",
              body: JSON.stringify({
                username: data.get("username"),
                password: data.get("password"),
              }),
            })
              .then((result) => {
                form.reset();
                setMessage(
                  result.created === false
                    ? "Perminister identity linked. Assign project access from Users."
                    : "Account created. Assign project access from Users.",
                );
              })
              .catch((e) => setError((e as Error).message))
              .finally(() => setBusy(false));
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
                aria-invalid={fieldErrors.username ? true : undefined}
                aria-describedby={
                  fieldErrors.username
                    ? validationId + "-username-error"
                    : undefined
                }
              />
              <FieldError
                id={validationId + "-username-error"}
                message={fieldErrors.username}
              />
            </label>
            <label>
              Initial password
              <input
                type="password"
                name="password"
                minLength={minimumPasswordLength}
                required
                autoComplete="new-password"
                aria-label="Initial password"
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
          </div>
          <button className={styles.primary} disabled={busy}>
            Create account
          </button>
        </form>
      </section>
    </>
  );
}

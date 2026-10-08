"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Notice } from "../ui";
import {
  clearFieldError,
  FieldError,
  validateForm,
  type FieldErrors,
} from "../form-validation";
import styles from "../workspace.module.css";
export function YourAccountSettings({
  minimumPasswordLength,
}: {
  minimumPasswordLength: number;
}) {
  const router = useRouter();
  const validationId = useId().replace(/:/g, "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
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
          <div className={styles.eyebrow}>ACCOUNT SECURITY</div>
          <h1>Your account</h1>
          <p className={styles.subtitle}>
            Update the password you use to sign in.
          </p>
        </div>
      </div>
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Change password</h2>
        </div>
        <form
          noValidate
          className={styles.formSection}
          onChange={(event) => {
            if (event.target instanceof HTMLInputElement)
              clearFieldError(setFieldErrors, event.target.name);
          }}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const validation = validateForm(form);
            setFieldErrors(validation.errors);
            if (validation.firstInvalid) {
              requestAnimationFrame(() => validation.firstInvalid?.focus());
              return;
            }
            const data = new FormData(form);
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
                aria-label="Current password"
                aria-invalid={fieldErrors.currentPassword ? true : undefined}
                aria-describedby={
                  fieldErrors.currentPassword
                    ? `${validationId}-currentPassword-error`
                    : undefined
                }
              />
              <FieldError
                id={`${validationId}-currentPassword-error`}
                message={fieldErrors.currentPassword}
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={minimumPasswordLength}
                required
                aria-label="New password"
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={
                  fieldErrors.password
                    ? `${validationId}-password-error`
                    : undefined
                }
              />
              <FieldError
                id={`${validationId}-password-error`}
                message={fieldErrors.password}
              />
            </label>
          </div>
          <small>
            At least {minimumPasswordLength} characters. Changing your password
            signs out all your sessions.
          </small>
          <button className={styles.secondary} disabled={busy}>
            Change password
          </button>
        </form>
      </section>
    </>
  );
}

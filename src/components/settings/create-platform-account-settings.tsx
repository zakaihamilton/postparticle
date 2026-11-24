"use client";

import { FieldError, validateForm } from "../form-validation";
import { api, Notice } from "../ui";
import styles from "../workspace-primitives.module.css";
import {
  PasswordField,
  PlatformAdminHeading,
  useSettingsFeedback,
  useValidatedForm,
} from "./settings-helpers";

export function CreatePlatformAccountSettings({
  minimumPasswordLength,
  request = api,
}: {
  minimumPasswordLength: number;
  request?: typeof api;
}) {
  const { error, setError, message, setMessage, busy, setBusy } =
    useSettingsFeedback();
  const { validationId, fieldErrors, setFieldErrors, handleFormChange } =
    useValidatedForm();

  return (
    <>
      <PlatformAdminHeading
        title="Create account"
        subtitle="New accounts start with no project access. Assign access from the users list."
      />
      <Notice error={error} message={message} />
      <section className={styles.panel}>
        <form
          noValidate
          className={styles.formSection}
          onChange={handleFormChange}
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
            void request<{ created?: boolean }>("/api/manage/users", {
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
            <PasswordField
              validationId={validationId}
              label="Initial password"
              minLength={minimumPasswordLength}
              error={fieldErrors.password}
            />
          </div>
          <button className={styles.primary} disabled={busy}>
            Create account
          </button>
        </form>
      </section>
    </>
  );
}

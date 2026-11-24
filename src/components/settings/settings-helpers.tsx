"use client";

import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import {
  clearFieldError,
  FieldError,
  type FieldErrors,
} from "../form-validation";
import styles from "../workspace-primitives.module.css";

export function useSettingsFeedback() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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

  return { error, setError, message, setMessage, busy, setBusy, run };
}

export function useValidatedForm() {
  const validationId = useId().replace(/:/g, "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleFormChange(event: FormEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLInputElement)
      clearFieldError(setFieldErrors, event.target.name);
  }

  return { validationId, fieldErrors, setFieldErrors, handleFormChange };
}

export function loadWhileActive<T>(
  promise: Promise<T>,
  isActive: () => boolean,
  onSuccess: (data: T) => void,
  setError: (msg: string) => void,
  setLoading: (loading: boolean) => void,
) {
  promise
    .then((data) => {
      if (isActive()) onSuccess(data);
    })
    .catch((e) => {
      if (isActive()) setError((e as Error).message);
    })
    .finally(() => {
      if (isActive()) setLoading(false);
    });
}

export function PlatformAdminHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className={styles.pageHeading}>
      <div>
        <div className={styles.eyebrow}>PLATFORM ADMINISTRATION</div>
        <h1>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <Link className={styles.secondary} href="/account/platform-accounts">
        View users
      </Link>
    </div>
  );
}

export function PasswordField({
  validationId,
  label,
  minLength,
  error,
}: {
  validationId: string;
  label: string;
  minLength: number;
  error?: string;
}) {
  const errorId = validationId + "-password-error";
  return (
    <label>
      {label}
      <input
        name="password"
        type="password"
        minLength={minLength}
        autoComplete="new-password"
        required
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} message={error} />
    </label>
  );
}

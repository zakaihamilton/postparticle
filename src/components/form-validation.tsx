"use client";

import type { Dispatch, SetStateAction } from "react";
import { usernameSchema, usernameError } from "@/lib/username";
import styles from "./form-validation.module.css";

export type FieldErrors = Record<string, string>;

export function validateForm(form: HTMLFormElement) {
  const errors: FieldErrors = {};
  let firstInvalid: HTMLElement | null = null;
  const fields = form.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input[name], textarea[name], select[name]");

  for (const field of fields) {
    if (field.disabled) continue;

    let message = "";
    if (field.required && field.value.length === 0) {
      message = "This field is required.";
    } else if (
      (field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement) &&
      field.minLength > 0 &&
      field.value.length < field.minLength
    ) {
      message = `Enter at least ${field.minLength} characters.`;
    } else if (
      field.name === "username" &&
      !usernameSchema.safeParse(field.value).success
    ) {
      message = usernameError;
    } else if (field instanceof HTMLInputElement && field.pattern) {
      try {
        if (!new RegExp(`^(?:${field.pattern})$`).test(field.value)) {
          message =
            field.name === "username"
              ? "Use 1–80 characters: start with a lowercase letter or number, then use lowercase letters, numbers, underscores, or hyphens."
              : "Use the required format.";
        }
      } catch {
        // An invalid pattern is ignored by native constraint validation too.
      }
    }

    if (message) {
      errors[field.name] = message;
      firstInvalid ??= field;
    }
  }

  return { errors, firstInvalid };
}

export function clearFieldError(
  setErrors: Dispatch<SetStateAction<FieldErrors>>,
  name: string | undefined,
) {
  if (!name) return;
  setErrors((current) => {
    if (!(name in current)) return current;
    const next = { ...current };
    delete next[name];
    return next;
  });
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span id={id} className={styles.error} role="alert">
      {message}
    </span>
  ) : null;
}

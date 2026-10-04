"use client";
import Link from "next/link";
import Image from "next/image";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Brand, Icon, Notice, ThemeSwitch } from "./ui";
import {
  clearFieldError,
  FieldError,
  validateForm,
  type FieldErrors,
} from "./form-validation";
import styles from "./auth.module.css";
export default function LoginForm() {
  const router = useRouter();
  const validationId = useId().replace(/:/g, "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  return (
    <div className={styles.page}>
      <header>
        <Brand />
        <ThemeSwitch />
      </header>
      <main className={styles.layout}>
        <section className={styles.story}>
          <span className={styles.eyebrow}>THE EDITORIAL WORKSPACE</span>
          <h1>
            Make room for
            <br />
            your next story.
          </h1>
          <p>
            Write, organize, and publish. Everything your team needs, in one
            place.
          </p>
          <Image
            className={styles.storyImage}
            src="/images/welcome/studio-editorial.webp"
            width={1536}
            height={1024}
            sizes="(max-width: 600px) 100vw, 50vw"
            alt="Paper proofs and books on a sunlit publishing desk"
          />
          <div className={styles.storyFooter}>
            <Icon name="lock" size={16} /> Your drafts stay private until you
            publish.
          </div>
        </section>
        <section className={styles.formPanel}>
          <div className={styles.formInner}>
            <span className={styles.smallIcon}>
              <Icon name="article" size={25} />
            </span>
            <h2>Welcome back.</h2>
            <p>Sign in to find your projects and pick up where you left off.</p>
            <form
              noValidate
              onChange={(event) => {
                if (event.target instanceof HTMLInputElement)
                  clearFieldError(setFieldErrors, event.target.name);
              }}
              onSubmit={async (e) => {
                e.preventDefault();
                const validation = validateForm(e.currentTarget);
                setFieldErrors(validation.errors);
                if (validation.firstInvalid) {
                  requestAnimationFrame(() => validation.firstInvalid?.focus());
                  return;
                }
                setBusy(true);
                setError("");
                const form = new FormData(e.currentTarget);
                try {
                  await api("/api/auth/login", {
                    method: "POST",
                    body: JSON.stringify({
                      username: String(form.get("username"))
                        .trim()
                        .toLowerCase(),
                      password: form.get("password"),
                    }),
                  });
                  router.push("/projects");
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Username
                <input
                  name="username"
                  autoComplete="username"
                  required
                  aria-label="Username"
                  aria-invalid={fieldErrors.username ? true : undefined}
                  aria-describedby={
                    fieldErrors.username
                      ? `${validationId}-username-error`
                      : undefined
                  }
                  placeholder="Username or email address"
                  maxLength={254}
                />
                <FieldError
                  id={`${validationId}-username-error`}
                  message={fieldErrors.username}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-label="Password"
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password
                      ? `${validationId}-password-error`
                      : undefined
                  }
                  placeholder="Your password"
                />
                <FieldError
                  id={`${validationId}-password-error`}
                  message={fieldErrors.password}
                />
              </label>
              <Notice error={error} />
              <button disabled={busy} type="submit">
                {busy ? "Signing in…" : "Log in"}
                <Icon name="arrow" size={18} />
              </button>
            </form>
            <div className={styles.help}>
              Forgot your username or password? Contact your platform
              administrator.
            </div>
            <Link href="/" className={styles.back}>
              <Icon name="arrow-left" size={14} /> Back to welcome
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

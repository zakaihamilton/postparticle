"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Brand, Icon, Notice, ThemeSwitch } from "./ui";
import styles from "./auth.module.css";
export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.page}>
      <header>
        <Brand />
        <ThemeSwitch />
      </header>
      <main className={styles.layout}>
        <section className={styles.story}>
          <span className={styles.eyebrow}>A SPACE TO MAKE THINGS HAPPEN</span>
          <h1>
            Your next great
            <br />
            story starts here.
          </h1>
          <p>
            One thoughtful workspace for all the content you bring to the world.
          </p>
          <div className={styles.art}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className={styles.storyFooter}>
            <Icon name="lock" size={16} /> A private workspace. A world of
            possibilities.
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
              onSubmit={async (e) => {
                e.preventDefault();
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
                  placeholder="Your username"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                />
              </label>
              <Notice error={error} />
              <button disabled={busy} type="submit">
                {busy ? "Signing in…" : "Log in"}
                <Icon name="arrow" size={18} />
              </button>
            </form>
            <div className={styles.help}>
              Need access? Contact your project administrator.
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

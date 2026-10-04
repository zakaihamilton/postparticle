"use client";
import { GuardedLink as Link } from "./navigation-guard";
import { useSyncExternalStore } from "react";
import Select from "./select";
import styles from "./ui.module.css";
function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <span className={styles.logoGlyph} aria-hidden="true">
        <svg width="31" height="33" viewBox="0 0 31 33" fill="none">
          <path
            d="M10 27V12h6a5 5 0 0 1 0 10h-6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="7" r="2.5" fill="#c6e0ff" />
        </svg>
      </span>
      <span>
        postp<span className={styles.highlight}>article</span>
      </span>
    </span>
  );
}
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className={styles.brand} href={href} aria-label="Postparticle home">
      <Wordmark />
    </Link>
  );
}
export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system");
  return (
    <Select
      label="Color theme"
      className={styles.themeControl}
      value={theme}
      options={[
        {
          value: "system",
          label: "System",
          icon: <Icon name="monitor" size={14} />,
        },
        { value: "light", label: "Light", icon: <Icon name="sun" size={14} /> },
        { value: "dark", label: "Dark", icon: <Icon name="moon" size={14} /> },
      ]}
      onValueChange={(value) => {
        try {
          localStorage.setItem("postparticle-theme", value);
        } catch {
          /* Theme still works when storage is unavailable. */
        }
        document.documentElement.dataset.theme = value;
        window.dispatchEvent(new Event("postparticle-theme"));
      }}
    />
  );
}
function readTheme() {
  let theme;
  try {
    theme = localStorage.getItem("postparticle-theme");
  } catch {}
  theme ||= document.documentElement.dataset.theme;
  return ["light", "dark"].includes(theme || "") ? theme! : "system";
}
function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("postparticle-theme", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("postparticle-theme", callback);
  };
}
const paths: Record<string, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  article: "M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2z M8 8h8 M8 12h8 M8 16h5",
  image:
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M3 17l6-6 4 4 3-3 5 5 M15 7h.01",
  code: "M8 5l-6 7 6 7 M16 5l6 7-6 7 M14 3l-4 18",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  "arrow-left": "M19 12H5 M11 6l-6 6 6 6",
  "arrow-up": "M12 19V5 M6 11l6-6 6 6",
  "arrow-down": "M12 5v14 M6 13l6 6 6-6",
  "arrow-up-right": "M5 19 19 5 M5 5h14v14",
  "arrow-down-right": "M5 5l14 14 M5 19h14V5",
  chevron: "m6 9 6 6 6-6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  play: "m8 4 12 8-12 8z",
  sparkle: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  burst: "M12 2v20 M2 12h20 M5 5l14 14 M5 19 19 5",
  monitor: "M3 3h18v14H3z M8 21h8 M12 17v4",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5l1.5 1.5 M5 19l1.5-1.5 M17.5 6.5l1.5-1.5",
  moon: "M20.5 13a9 9 0 1 1-9.5-9.5 7 7 0 0 0 9.5 9.5z",
  plus: "M12 5v14 M5 12h14",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2c6 6 6 14 0 20-6-6-6-14 0-20",
  upload: "M12 16V3 M7 8l5-5 5 5 M3 16v5h18v-5",
  logout: "M9 4H3v16h6 M12 12h10 M17 7l5 5-5 5",
  check: "M4 12l5 5L20 6",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 2",
  lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={styles.icon}
    >
      <path d={paths[name] ?? paths.article} />
    </svg>
  );
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
export function Notice({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return error ? (
    <div className={styles.error} role="alert">
      {error}
    </div>
  ) : message ? (
    <div className={styles.notice} role="status">
      {message}
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name="article" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

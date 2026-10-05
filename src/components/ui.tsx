"use client";
import { GuardedLink as Link } from "./navigation-guard";
import { useSyncExternalStore } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Asterisk,
  Check,
  ChevronDown,
  Clock,
  CodeXml,
  FileText,
  Globe,
  ImageIcon,
  LayoutGrid,
  LinkIcon,
  LockKeyhole,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
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
          <circle cx="24" cy="7" r="2.5" fill="currentColor" opacity="0.7" />
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
const icons: Record<string, LucideIcon> = {
  grid: LayoutGrid,
  article: FileText,
  image: ImageIcon,
  code: CodeXml,
  users: Users,
  settings: Settings,
  arrow: ArrowRight,
  "arrow-left": ArrowLeft,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "arrow-up-right": ArrowUpRight,
  "arrow-down-right": ArrowDownRight,
  chevron: ChevronDown,
  menu: Menu,
  link: LinkIcon,
  play: Play,
  sparkle: Sparkles,
  burst: Asterisk,
  monitor: Monitor,
  sun: Sun,
  moon: Moon,
  plus: Plus,
  search: Search,
  globe: Globe,
  upload: Upload,
  logout: LogOut,
  check: Check,
  clock: Clock,
  lock: LockKeyhole,
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const Glyph = icons[name] ?? FileText;
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
      className={styles.icon}
    />
  );
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, data.error || "Request failed");
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
    <div key={message} className={styles.notice} role="status">
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

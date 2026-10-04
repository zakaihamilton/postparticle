import type { Metadata } from "next";
import Link from "next/link";
import { Brand, Icon, ThemeSwitch } from "@/components/ui";
import DeveloperNavigation from "@/components/developers/navigation";
import DeveloperSearch from "@/components/developers/search";
import styles from "@/components/developers/developers.module.css";
export const metadata: Metadata = {
  title: "Developer guides",
  description:
    "Integrate published Postparticle content with Next.js using the public API, with endpoint reference and troubleshooting guides.",
};
export default function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <Link className={styles.skipLink} href="#guide-content">
        Skip to guide
      </Link>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Developer header">
          <Link href="/">Welcome</Link>
          <ThemeSwitch />
          <Link href="/login">
            Log in <Icon name="arrow" size={15} />
          </Link>
        </nav>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <span className={styles.eyebrow}>DEVELOPER GUIDES</span>
          <DeveloperSearch />
          <DeveloperNavigation />
          <p>Use the public API to add published articles to a Next.js site.</p>
        </aside>
        <main id="guide-content" className={styles.main}>
          {children}
        </main>
      </div>
      <footer className={styles.footer}>
        <Brand />
        <span>Postparticle API · Developer guides</span>
      </footer>
    </div>
  );
}

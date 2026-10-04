import type { Metadata } from "next";
import Link from "next/link";
import styles from "./blog.module.css";
import { websiteUrl } from "../lib/content";
export const metadata: Metadata = {
  title: { default: "Demo Journal", template: "%s · Demo Journal" },
  description:
    "A sample website that renders published articles from Postparticle.",
  metadataBase: new URL(websiteUrl),
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={styles.body}>
        <header className={styles.header}>
          <Link href="/">Demo Journal</Link>
          <Link href="/blog">Articles</Link>
        </header>
        <main className={styles.main}>{children}</main>
      </body>
    </html>
  );
}

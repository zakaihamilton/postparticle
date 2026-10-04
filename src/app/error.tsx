"use client";
import Link from "next/link";
import styles from "@/components/workspace.module.css";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className={styles.pickerMain}>
      <h1>We couldn’t open this page.</h1>
      <p className={styles.subtitle}>
        Check your connection and storage configuration, then try again.
      </p>
      <div className={styles.buttonGroup}>
        <button className={styles.primary} onClick={reset}>
          Try again
        </button>
        <Link href="/" className={styles.secondary}>
          Welcome page
        </Link>
      </div>
    </main>
  );
}

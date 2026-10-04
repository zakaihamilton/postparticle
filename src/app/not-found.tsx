import Link from "next/link";
import styles from "@/components/workspace.module.css";
export default function NotFound() {
  return (
    <main className={styles.pickerMain}>
      <div className={styles.eyebrow}>404</div>
      <h1>This page wandered off.</h1>
      <p className={styles.subtitle}>
        Head back to your workspace or start at the welcome page.
      </p>
      <Link href="/" className={styles.primary}>
        Back to welcome
      </Link>
    </main>
  );
}

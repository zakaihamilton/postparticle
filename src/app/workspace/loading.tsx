import styles from "@/components/workspace.module.css";
export default function Loading() {
  return (
    <main aria-live="polite" className={styles.loading}>
      Opening your workspace…
    </main>
  );
}

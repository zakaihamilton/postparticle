import styles from "@/components/workspace.module.css";

export default function WorkspaceLoading() {
  return (
    <main aria-live="polite" className={styles.loading}>
      Opening workspace content…
    </main>
  );
}

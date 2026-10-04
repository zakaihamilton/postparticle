"use client";
import { GuardedLink as Link } from "../navigation-guard";
import styles from "../workspace.module.css";
export function IntegrationSettings({ projectId }: { projectId: string }) {
  return (
    <>
      <div className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>YOUR CONTENT, EVERYWHERE</div>
          <h1>Settings & API</h1>
          <p className={styles.subtitle}>
            Connect your workspace to whatever you’re building.
          </p>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Published content API</h2>
          <span className={styles.badge}>v1</span>
        </div>
        <div className={styles.formSection}>
          <p className={styles.subtitle}>
            These endpoints are public and return published content only. Fetch
            them on your website’s server to render content and SEO metadata.
          </p>
          {[
            `/api/v1/projects/${projectId}/articles?q=&tag=&order=desc&page=1&pageSize=12`,
            `/api/v1/projects/${projectId}/articles/{slug}`,
            `/api/v1/projects/${projectId}/documents/{key}`,
          ].map((url) => (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll these API examples.
            <pre className={styles.codeBlock} key={url} tabIndex={0}>
              GET {url}
            </pre>
          ))}
          <p className={styles.subtitle}>
            <Link href="/developers">Read the Next.js developer guides</Link>{" "}
            for copyable examples, search metadata, and the runnable blog. A
            60-second revalidation interval is a good starting point.
          </p>
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Project storage</h2>
        </div>
        <div className={styles.formSection}>
          <p className={styles.subtitle}>
            Storage credentials are configured through server-only environment
            variables. Ask your deployment administrator to change them. Drafts
            and originals are private; published media has public delivery
            copies.
          </p>
        </div>
      </section>
    </>
  );
}

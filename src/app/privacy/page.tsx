import Link from "next/link";
import styles from "../privacy.module.css";

export const metadata = {
  title: "Privacy policy · Postparticle",
  description: "How Postparticle handles account information, editorial content, and media.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Postparticle
        </Link>
        <Link className={styles.backLink} href="/">
          Back to welcome
        </Link>
      </header>

      <article className={styles.document} aria-labelledby="privacy-title">
        <p className={styles.kicker}>Postparticle · Privacy</p>
        <h1 id="privacy-title">Privacy policy</h1>
        <p className={styles.intro}>
          Postparticle is operated by Zakai Hamilton. This page explains the information handled
          when you use the Postparticle workspace, content API, and publishing features.
        </p>
        <p className={styles.updated}>Last updated November 17, 2026</p>

        <div className={styles.sections}>
          <section>
            <h2>Information the service handles</h2>
            <p>
              Perminister provides the identity, organization membership, and project permissions
              needed to sign in. Postparticle does not store local account passwords or maintain a
              separate account directory.
            </p>
            <p>
              The workspace stores information you or your team add, such as articles and drafts,
              revisions, tags, dates, search and social metadata, media, and JSON documents. It
              also processes project membership and records needed to save, publish, restore, and
              deliver that content. Requests to the service may include ordinary connection and
              diagnostic information.
            </p>
          </section>

          <section>
            <h2>How information is used and shared</h2>
            <p>
              Information is used to provide the editorial workspace, apply project access
              permissions, store revisions, and return published content through the API. Drafts
              and original media are stored privately in the S3-compatible object-storage Space
              configured for the service. When you publish content or media, the public version
              can be delivered to your website and its readers. Published media may remain in a
              delivery cache for a time after it is unpublished or removed.
            </p>
            <p>
              The production service uses Vercel for application hosting, Perminister for identity
              and access control, and a configured object-storage provider for content and media.
              Project administrators and members can see content according to the permissions set
              for their project. Published content is available to anyone who can reach the
              published URL or API endpoint.
            </p>
          </section>

          <section>
            <h2>Cookies and browser storage</h2>
            <p>
              Sign-in uses a secure, HTTP-only application session cookie. The site also stores
              your appearance preference in browser storage. The public content API does not
              require a visitor account to read content that a project has published.
            </p>
          </section>

          <section>
            <h2>Retention and control</h2>
            <p>
              Drafts, published snapshots, and revisions are kept to support the editing and
              recovery features. Project administrators can delete content and permanently delete
              archived projects. Public media that has already been cached by a delivery network
              may remain available until that cache expires. A restricted historical backup of
              account-control records from before the Perminister migration may also remain
              offline; the application no longer uses it for sign-in or access control.
            </p>
            <p>
              If your account belongs to an organization, its administrators manage project access
              and content. For a request about information held by Postparticle, you can also
              contact the service operator directly.
            </p>
          </section>

          <section>
            <h2>Requests and contact</h2>
            <p>
              For a privacy question or request, contact Zakai Hamilton using the contact
              information on the <a href="https://www.perminister.com/privacy">Perminister privacy
              page</a>. If you are a reader of a site that publishes Postparticle content, contact
              the site operator for questions about that site's collection and use of information.
            </p>
          </section>

          <section>
            <h2>Changes to this policy</h2>
            <p>
              Updates will appear on this page with a revised date as the service or its data
              handling changes.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}

import Link from "next/link";
import Guide from "@/components/developers/guide";
import { guideLinks } from "@/components/developers/topics";
import { Icon } from "@/components/ui";
import styles from "@/components/developers/developers.module.css";

const nextjsGuides = [
  {
    href: guideLinks[1].href,
    title: guideLinks[1].title,
    description:
      "Configure server environment variables and add a typed, server-only API helper.",
    icon: "code",
  },
  {
    href: guideLinks[2].href,
    title: guideLinks[2].title,
    description:
      "Render recent content and add validated search, tag filters, sorting, and pagination.",
    icon: "article",
  },
  {
    href: guideLinks[3].href,
    title: guideLinks[3].title,
    description:
      "Load a published article by slug, render Markdown and media, and handle errors.",
    icon: "image",
  },
  {
    href: guideLinks[4].href,
    title: guideLinks[4].title,
    description:
      "Add canonical and social metadata, a sitemap, and a cache policy.",
    icon: "globe",
  },
] as const;

export default function Developers() {
  return (
    <Guide
      index={0}
      title="Integrate published articles with Next.js"
      intro="Use the public Postparticle API to render published articles in a TypeScript Next.js App Router site. The guides cover setup, listings, article pages, metadata, caching, API behavior, and common integration problems."
      sections={[
        { id: "start", title: "Prerequisites" },
        { id: "guides", title: "Next.js guide sequence" },
        { id: "references", title: "API and troubleshooting" },
        { id: "resources", title: "AI prompt and example" },
      ]}
    >
      <section id="start">
        <h2>Prerequisites</h2>
        <p>
          You need a TypeScript Next.js App Router project, the base URL of a
          running Postparticle deployment, a project ID, and at least one
          published article. The examples use <code>demo</code> as the project
          ID. Requests run on your website server; no workspace login or Spaces
          credentials are required.
        </p>
        <ol>
          <li>
            Set <code>POSTPARTICLE_URL</code>, <code>POSTPARTICLE_PROJECT</code>,
            <code>POSTPARTICLE_ORGANIZATION_ID</code>, and <code>WEBSITE_URL</code>
            as server-side environment variables.
          </li>
          <li>
            Follow the setup guide to add a server-only helper, then render the
            results in Server Components or another server-rendered route.
          </li>
          <li>
            Add article routes, metadata, sitemap entries, and a cache policy
            that fits the freshness requirements of your site.
          </li>
        </ol>
      </section>
      <section id="guides">
        <h2>Next.js guide sequence</h2>
        <p>
          Start with setup, then follow the guides in order. Each guide links to
          the next step and includes copyable examples from the runnable demo.
        </p>
        <div className={styles.cards}>
          {nextjsGuides.map((guide) => (
            <Link className={styles.card} key={guide.href} href={guide.href}>
              <span>
                <Icon name={guide.icon} />
                {guide.title}
                <Icon name="arrow-up-right" size={16} />
              </span>
              <p>{guide.description}</p>
            </Link>
          ))}
        </div>
      </section>
      <section id="references">
        <h2>API and troubleshooting</h2>
        <p>
          Use the API reference to check endpoints, query limits, response
          fields, media behavior, and error status codes. Troubleshooting lists
          checks for connection failures, 404 and 400 responses, stale content,
          and missing media.
        </p>
        <p>
          <Link href={guideLinks[5].href}>Open the API reference</Link> or{" "}
          <Link href={guideLinks[6].href}>troubleshoot an integration</Link>.
        </p>
      </section>
      <section id="resources">
        <h2>AI prompt, runnable example, and integration reference</h2>
        <p>
          To adapt the integration to an existing project, copy the prompt in
          the setup guide. It asks an AI coding assistant to inspect the
          repository, follow its conventions, and keep API requests on the
          server. Replace the Postparticle URL, project ID, and public website
          URL before copying.
        </p>
        <p>
          <Link href="/developers/nextjs/setup#existing-project">
            View the copyable integration prompt
          </Link>
          . The examples in <code>examples/next-blog</code> provide a separate
          application for trying the API. The example includes CSS Modules and a
          public robots file; an existing site can keep its current styling.
        </p>
        <p>
          <Link href="/developers/nextjs/setup#runnable-example">
            Run the Next.js example
          </Link>{" "}
          or download the{" "}
          <a href="/developers/resources/integration" download="integration.md">
            integration reference
          </a>
          . The downloadable Markdown is a separate resource and is not included
          in guide search.
        </p>
        <p>
          The optional typed client lives in <code>src/lib/client.ts</code>.
          Copy it with its public types if you want a client abstraction. This
          repository is an application and does not publish an SDK package.
        </p>
      </section>
    </Guide>
  );
}

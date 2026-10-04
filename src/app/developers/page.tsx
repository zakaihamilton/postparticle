import Link from "next/link";
import Guide from "@/components/developers/guide";
import { guideLinks } from "@/components/developers/topics";
import { Icon } from "@/components/ui";
import styles from "@/components/developers/developers.module.css";
export default function Developers() {
  return (
    <Guide
      index={0}
      title="Your articles. Your Next.js website."
      intro="Connect Postparticle to your website with server-rendered pages. Keep your design, and let your editorial team manage what gets published."
      sections={[
        { id: "start", title: "Before you start" },
        { id: "guides", title: "Integration guides" },
        { id: "resources", title: "Repository resources" },
      ]}
    >
      <section id="start">
        <h2>Before you start</h2>
        <p>
          You need a Next.js App Router application with TypeScript, a deployed
          Postparticle origin, and a project with at least one published
          article. The examples use a fictional project named <code>demo</code>.
        </p>
        <ol>
          <li>
            Connect your website with three environment variables and a
            server-only fetch helper.
          </li>
          <li>
            Render recent articles, lists, and individual stories on the server.
          </li>
          <li>
            Add search metadata and a sitemap, then choose how often your
            website refreshes.
          </li>
        </ol>
        <div className={styles.callout}>
          <p>
            Published content is public. These guides require no account, Spaces
            keys, or login cookies. Drafts remain inside your private workspace.
          </p>
        </div>
      </section>
      <section id="guides">
        <h2>Build it, one page at a time</h2>
        <div className={styles.cards}>
          {guideLinks.slice(1).map((guide, i) => (
            <Link className={styles.card} key={guide.href} href={guide.href}>
              <span>
                <Icon name={["code", "article", "image", "globe"][i]} />
                {guide.title}
                <Icon name="arrow-up-right" size={16} />
              </span>
              <p>
                {
                  [
                    "Configuration, dependencies, and typed native fetch.",
                    "Homepage stories, search, tags, sorting, and pagination.",
                    "A complete article route with safe Markdown and error handling.",
                    "Canonical URLs, social previews, JSON-LD, and sitemap generation.",
                  ][i]
                }
              </p>
            </Link>
          ))}
        </div>
      </section>
      <section id="resources">
        <h2>Keep the runnable example close</h2>
        <p>
          Every TypeScript snippet in these guides comes from{" "}
          <code>examples/next-blog</code> in the repository and is checked by
          the project’s type checks. The complete example includes CSS Modules
          and a public robots file.
        </p>
        <p>
          <Link href="/developers/nextjs/setup#runnable-example">
            Run the generic blog example
          </Link>{" "}
          or{" "}
          <a href="/developers/resources/integration" download="integration.md">
            download the repository integration guide
          </a>{" "}
          (<code>docs/integration.md</code>).
        </p>
        <p>
          The optional typed client lives in <code>src/lib/client.ts</code>.
          Copy it with its public types if you prefer a client abstraction;
          Postparticle is an application, not a published SDK package.
        </p>
      </section>
    </Guide>
  );
}

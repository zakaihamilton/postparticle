import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Guide from "@/components/developers/guide";
import CodeBlock from "@/components/developers/code-block";
import { integrationPrompt } from "@/components/developers/integration-prompt";
import { snippets } from "@/components/developers/snippets";
import styles from "@/components/developers/developers.module.css";

const pages = {
  setup: {
    index: 1,
    title: "Set up the API connection",
    intro:
      "Configure a Next.js site and add a server-only helper to read published articles.",
    sections: [
      { id: "configuration", title: "Environment variables" },
      { id: "existing-project", title: "Integrate into an existing project" },
      { id: "helper", title: "Typed fetch helper" },
      { id: "foundation", title: "Layout and styles" },
      { id: "runnable-example", title: "Run the example" },
    ],
  },
  articles: {
    index: 2,
    title: "List and filter articles",
    intro:
      "Fetch published articles for a homepage or paginated blog, with optional search, tag, and date filters.",
    sections: [
      { id: "recent", title: "Homepage articles" },
      { id: "listing", title: "Search and pagination" },
      { id: "queries", title: "Listing API" },
    ],
  },
  "article-pages": {
    index: 3,
    title: "Render an article page",
    intro:
      "Load a published article by slug, render its Markdown, and handle missing content and API errors.",
    sections: [
      { id: "route", title: "Article route" },
      { id: "markdown", title: "Markdown and media" },
      { id: "errors", title: "Errors and missing articles" },
    ],
  },
  "metadata-and-caching": {
    index: 4,
    title: "Add metadata and manage freshness",
    intro:
      "Set canonical and social metadata, include every published article in the sitemap, and choose how quickly cached content updates.",
    sections: [
      { id: "metadata", title: "Metadata and JSON-LD" },
      { id: "sitemap", title: "Sitemap and robots" },
      { id: "freshness", title: "Cache freshness" },
    ],
  },
};
export const dynamicParams = false;
type Topic = keyof typeof pages;
function topic(value: string): Topic {
  if (!Object.hasOwn(pages, value)) notFound();
  return value as Topic;
}
export function generateStaticParams() {
  return Object.keys(pages).map((guide) => ({ guide }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ guide: string }>;
}): Promise<Metadata> {
  const page = pages[topic((await params).guide)];
  return { title: page.title, description: page.intro };
}
function Snippet({ name }: { name: keyof typeof snippets }) {
  return <CodeBlock {...snippets[name]} />;
}
export default async function DeveloperGuide({
  params,
}: {
  params: Promise<{ guide: string }>;
}) {
  const name = topic((await params).guide);
  return (
    <Guide {...pages[name]} group="nextjs">
      {name === "setup" && (
        <>
          <section id="configuration">
            <h2>Set environment variables</h2>
            <p>
              Use a TypeScript Next.js App Router project. The examples place{" "}
              <code>app/</code> and <code>lib/</code> at the project root. If
              your project uses <code>src/</code>, place both folders inside it.
              Keep these values on the website server.
            </p>
            <CodeBlock
              filename=".env.local"
              code={
                "POSTPARTICLE_URL=https://cms.example.com\nPOSTPARTICLE_PROJECT=demo\nPOSTPARTICLE_ORGANIZATION_ID=<organization-uuid>\nWEBSITE_URL=https://journal.example.com\n"
              }
            />
            <p>
              Set <code>POSTPARTICLE_URL</code> to the base URL of your
              Postparticle deployment, <code>POSTPARTICLE_PROJECT</code> to your
              project ID, <code>POSTPARTICLE_ORGANIZATION_ID</code> to the
              organization that owns that project, and <code>WEBSITE_URL</code>
              to the base URL readers use for your public website, without a
              trailing slash. Replace the
              example values. Configure these variables in each Vercel
              environment, or in your hosting provider’s environment settings.
              Restart the local server after changing <code>.env.local</code>.
            </p>
            <CodeBlock
              filename="Terminal — website dependencies"
              code="npm install server-only react-markdown remark-gfm"
            />
            <div className={styles.callout}>
              <p>
                The public articles API needs no Spaces credentials, access
                tokens, or login cookies. It does not expose drafts or
                management endpoints.
              </p>
            </div>
          </section>
          <section id="existing-project">
            <h2>Integrate into an existing project</h2>
            <p>
              If you use an AI coding assistant, provide the values below and
              ask it to inspect your repository before editing. The prompt
              directs it to follow your framework and project conventions, keep
              API requests on the server, and use the public endpoints described
              in these guides.
            </p>
            <p>
              Replace the three placeholders before copying. Do not include
              credentials; the published-content API does not require them.
            </p>
            <CodeBlock
              filename="AI integration prompt"
              code={integrationPrompt}
            />
          </section>
          <section id="helper">
            <h2>Add a server-only API helper</h2>
            <p>
              Create <code>lib/content.ts</code> in your website. The helper
              defines the article response shape, encodes project IDs and slugs,
              omits unset query parameters, and sets a 60-second revalidation
              interval. <code>connection()</code> defers the fetch until a
              request arrives, so the production build does not require a
              running Postparticle instance.
            </p>
            <Snippet name="helper" />
            <p>
              The helper maps an article 404 response to Next.js{" "}
              <code>notFound()</code>. Other HTTP errors and network failures
              propagate to the website’s error boundary. The TypeScript response
              types describe the API contract; they do not validate responses at
              runtime.
            </p>
          </section>
          <section id="foundation">
            <h2>Add the example layout and styles</h2>
            <p>
              These files provide the styles used by the later examples. In an
              existing website, merge the metadata into your layout and keep
              your current design.
            </p>
            <Snippet name="layout" />
            <Snippet name="css" />
          </section>
          <section id="runnable-example">
            <h2>Run the example application</h2>
            <p>
              The files are in <code>examples/next-blog</code>. Start
              Postparticle locally and publish an article, then run this command
              from the repository root:
            </p>
            <CodeBlock
              filename="Terminal — run the example"
              code={`POSTPARTICLE_URL=http://localhost:3300 POSTPARTICLE_PROJECT=demo POSTPARTICLE_ORGANIZATION_ID="<organization-uuid>" WEBSITE_URL=http://localhost:3301 npm run example:dev -- --port 3301`}
            />
            <p>
              Open{" "}
              <a href="http://localhost:3301/blog">the local example blog</a>.
              Run <code>npm run example:build</code> to build it. To deploy the
              example as a separate website, copy its files and install its
              dependencies in that project. Do not copy Postparticle storage
              configuration.
            </p>
            <p>
              See the{" "}
              <a
                href="/developers/resources/integration"
                download="integration.md"
              >
                integration reference
              </a>{" "}
              for the optional typed client and JSON document endpoint. This
              application does not publish an SDK package.
            </p>
          </section>
        </>
      )}
      {name === "articles" && (
        <>
          <section id="recent">
            <h2>Render recent articles on the homepage</h2>
            <p>
              Use the{" "}
              <Link href="/developers/nextjs/setup">
                setup guide’s API helper and styles
              </Link>
              . This example fetches three published articles in a Server
              Component. Results are ordered by article date, newest first, with
              the slug breaking ties. If the API returns no articles, the page
              shows an empty state.
            </p>
            <Snippet name="home" />
          </section>
          <section id="listing">
            <h2>Add search, filters, and pagination</h2>
            <p>
              The page reads and validates query parameters on the server before
              calling the API. Search and tag filters can be combined. Changing
              filters resets pagination, and previous/next links preserve the
              current filters and date order. Unset filters are omitted from the
              request. Invalid values show correction guidance and do not
              trigger an API request.
            </p>
            <p>
              Add the validation helper and filter component before the listing
              page. The filter component resets when URL values change. Its
              Clear link also resets unsent edits when the page is already
              unfiltered.
            </p>
            <Snippet name="filters" />
            <Snippet name="filterControls" />
            <Snippet name="listing" />
          </section>
          <section id="queries">
            <h2>Listing endpoint parameters</h2>
            <CodeBlock
              filename="HTTP — listing example"
              code="GET /api/v1/projects/demo/articles?organizationId={organizationId}&q=journey&tag=journal&order=desc&page=1&pageSize=12"
            />
            <ul>
              <li>
                <code>q</code>: case-insensitive search across title, excerpt,
                and Markdown body; maximum 200 characters.
              </li>
              <li>
                <code>tag</code>: exact, case-insensitive tag matching; maximum
                60 characters.
              </li>
              <li>
                <code>order</code>: <code>asc</code> or <code>desc</code>, using
                the editable article date.
              </li>
              <li>
                <code>page</code>: 1–100000. <code>pageSize</code>: 1–100;
                default 12.
              </li>
            </ul>
            <p>
              The response contains <code>items</code>, <code>total</code>,{" "}
              <code>page</code>, and <code>pageSize</code>. Only published
              articles appear. An empty result means there are no matching
              articles. A storage failure is an error and should reach the
              website’s error boundary.
            </p>
          </section>
        </>
      )}
      {name === "article-pages" && (
        <>
          <section id="route">
            <h2>Create a route for each article</h2>
            <p>
              Use the{" "}
              <Link href="/developers/nextjs/setup#helper">
                server-only API helper
              </Link>{" "}
              and styles from setup. Create this file at{" "}
              <code>app/blog/[slug]/page.tsx</code>. It loads the published
              article for the slug, renders its content, and generates metadata
              from the article record. The async <code>params</code> match the
              current App Router interface.
            </p>
            <Snippet name="article" />
          </section>
          <section id="markdown">
            <h2>Render Markdown and media safely</h2>
            <p>
              <code>react-markdown</code> renders the body with raw HTML
              disabled by <code>skipHtml</code>. Its default URL handling
              rejects unsafe schemes. <code>remark-gfm</code> adds tables, task
              lists, and other GitHub-flavored Markdown features. Keep raw HTML
              disabled and retain safe URL handling.
            </p>
            <p>
              When an article is published, Postparticle resolves valid media
              references to public delivery URLs. The API supplies{" "}
              <code>coverUrl</code> and <code>socialImageUrl</code>; it does not
              return private object keys. Add alt text to Markdown images. The
              example uses the article title as cover alt text. Video references
              render as links; add a player if your site needs one.
            </p>
          </section>
          <section id="errors">
            <h2>Handle missing articles and API errors</h2>
            <p>
              The helper calls Next.js <code>notFound()</code> when an article
              is missing or unpublished. HTTP 400 and 503 responses and network
              failures propagate to the error boundary. Add{" "}
              <code>app/error.tsx</code> to show a recovery message.
            </p>
            <p>
              Saving a draft does not change the published article. The website
              receives edits only after an explicit publish, subject to its
              cache settings.
            </p>
          </section>
        </>
      )}
      {name === "metadata-and-caching" && (
        <>
          <section id="metadata">
            <h2>Set article metadata and JSON-LD</h2>
            <p>
              The{" "}
              <Link href="/developers/nextjs/article-pages#route">
                article route
              </Link>{" "}
              includes <code>generateMetadata</code> and JSON-LD. The SEO title
              and description fall back to the article title and excerpt. The
              social image falls back to the cover. <code>WEBSITE_URL</code>{" "}
              must be your public website origin.
            </p>
            <p>
              The example sets canonical, Open Graph, and Twitter metadata, plus
              author and publication/modification timestamps. It escapes{" "}
              <code>&lt;</code> in JSON-LD so article text cannot close the
              script element.
            </p>
            <p>
              The server renders the article and its metadata into the initial
              HTML. Keep the fetch on the server to preserve this behavior.
            </p>
          </section>
          <section id="sitemap">
            <h2>Include published articles in the sitemap</h2>
            <p>
              The sitemap requests up to 100 articles per API page and continues
              until it has traversed the result set. Fetching only the first
              page would omit older articles.
            </p>
            <Snippet name="sitemap" />
            <p>
              The example’s robots file allows indexing on the website. The
              Postparticle workspace and developer guides remain noindex; do not
              copy their noindex headers to your public website.
            </p>
            <Snippet name="robots" />
          </section>
          <section id="freshness">
            <h2>Choose a cache policy</h2>
            <p>
              The API sends <code>Cache-Control: no-store</code>. The example
              sets its server-side fetch cache with{" "}
              <code>next: &#123; revalidate: 60 &#125;</code>. After publishing
              or unpublishing, a cached page can continue to show the previous
              content until the cache refreshes. Revalidation occurs on a later
              request; 60 seconds is an interval, not a delivery guarantee.
            </p>
            <p>
              Browser router caches and CDN caches can extend the delay. Use{" "}
              <code>&#123; cache: &quot;no-store&quot; &#125;</code> instead of{" "}
              <code>next.revalidate</code> if each server request must fetch
              current content. Do not combine the options. Avoid build-only
              fetching if content must update without a redeployment.
            </p>
            <p>
              Unpublishing removes the article from the API. Previously cached
              pages and public media URLs may remain available.
            </p>
          </section>
        </>
      )}
    </Guide>
  );
}

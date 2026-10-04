import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Guide from "@/components/developers/guide";
import CodeBlock from "@/components/developers/code-block";
import { snippets } from "@/components/developers/snippets";
import styles from "@/components/developers/developers.module.css";

const pages = {
  setup: {
    index: 1,
    title: "Connect your website.",
    intro:
      "Three environment variables and one server-only helper connect your website to published content.",
    sections: [
      { id: "configuration", title: "Configuration" },
      { id: "helper", title: "Typed fetch helper" },
      { id: "foundation", title: "Layout & styles" },
      { id: "runnable-example", title: "Runnable example" },
    ],
  },
  articles: {
    index: 2,
    title: "Give your stories a home.",
    intro:
      "Render recent stories on your homepage, then build a blog with search, tags, date sorting, and pagination.",
    sections: [
      { id: "recent", title: "Recent articles" },
      { id: "listing", title: "Blog listing" },
      { id: "queries", title: "API parameters" },
    ],
  },
  "article-page": {
    index: 3,
    title: "Open the whole story.",
    intro:
      "A server-rendered article route gives readers the content immediately and keeps Markdown rendering safe.",
    sections: [
      { id: "route", title: "Article route" },
      { id: "markdown", title: "Markdown & media" },
      { id: "errors", title: "Missing articles & errors" },
    ],
  },
  seo: {
    index: 4,
    title: "Ready for readers. And search.",
    intro:
      "Give each story its own canonical URL, social preview, structured data, and a place in your website’s sitemap.",
    sections: [
      { id: "metadata", title: "Metadata & JSON-LD" },
      { id: "sitemap", title: "Sitemap & robots" },
      { id: "freshness", title: "Publication freshness" },
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
    <Guide {...pages[name]}>
      {name === "setup" && (
        <>
          <section id="configuration">
            <h2>Configure the consuming website</h2>
            <p>
              Use a TypeScript Next.js App Router project. The examples use{" "}
              <code>app/</code> and <code>lib/</code> at the project root; if
              you use <code>src/</code>, put both folders inside it. Keep these
              values on your website server.
            </p>
            <CodeBlock
              filename=".env.local"
              code={
                "POSTPARTICLE_URL=https://cms.example.com\nPOSTPARTICLE_PROJECT=demo\nWEBSITE_URL=https://journal.example.com\n"
              }
            />
            <p>
              Use your deployed CRM origin, your project ID, and your public
              website’s canonical origin (without a trailing slash). Replace the
              fictional values, and configure them in your website’s Vercel
              project for each environment. Restart locally after changing
              environment variables.
            </p>
            <CodeBlock
              filename="Terminal — website dependencies"
              code="npm install server-only react-markdown remark-gfm"
            />
            <div className={styles.callout}>
              <p>
                No Spaces credentials, access tokens, or login cookies are
                required. Fetching published articles does not grant access to
                drafts or management endpoints.
              </p>
            </div>
          </section>
          <section id="helper">
            <h2>A typed native-fetch helper</h2>
            <p>
              Create this file in your website. It returns the published API’s
              public types, encodes project IDs and slugs, omits unset query
              parameters, and uses a 60-second fetch revalidation interval.{" "}
              <code>connection()</code> defers fetching to request time,
              allowing production builds without a running CRM.
            </p>
            <Snippet name="helper" />
            <p>
              The helper maps only article 404 responses to Next.js{" "}
              <code>notFound()</code>. Network failures and other HTTP errors
              propagate to your website’s error boundary. Types describe the API
              contract; they do not perform runtime response validation.
            </p>
          </section>
          <section id="foundation">
            <h2>Start with a layout and CSS Modules</h2>
            <p>
              These complete files supply the styles referenced by the following
              guides. In an existing website, merge the layout metadata and
              reuse your own design instead of replacing its layout.
            </p>
            <Snippet name="layout" />
            <Snippet name="css" />
          </section>
          <section id="runnable-example">
            <h2>Run the repository example</h2>
            <p>
              The same files live in <code>examples/next-blog</code>. From the
              Postparticle repository root, with the CRM running locally and an
              article published:
            </p>
            <CodeBlock
              filename="Terminal — run the example"
              code="POSTPARTICLE_URL=http://localhost:3300 POSTPARTICLE_PROJECT=demo WEBSITE_URL=http://localhost:3301 npm run example:dev -- --port 3301"
            />
            <p>
              Open{" "}
              <a href="http://localhost:3301/blog">the local example blog</a>.
              Build it with <code>npm run example:build</code>. For a separate
              Vercel project, copy the shown files into your website and install
              its dependencies; do not copy CRM storage configuration.
            </p>
            <p>
              See the{" "}
              <a
                href="/developers/resources/integration"
                download="integration.md"
              >
                repository integration guide
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
            <h2>Recent articles on your homepage</h2>
            <p>
              Start with the{" "}
              <Link href="/developers/nextjs/setup">
                setup guide’s helper and styles
              </Link>
              . Fetch three published articles in a Server Component. The
              default order is article date descending; the slug breaks ties. An
              empty response shows an explicit empty state.
            </p>
            <Snippet name="home" />
          </section>
          <section id="listing">
            <h2>A searchable, paginated blog</h2>
            <p>
              This page reads the URL’s query parameters on the server. Search
              and tag filters combine; changing filters resets pagination.
              Previous and next links preserve your search, tag, and date order.
              Unset filters are omitted rather than sent as literal undefined
              values. Server-side validation keeps malformed URLs from reaching
              the API. Invalid filters show correction guidance instead of an
              empty result or a server error.
            </p>
            <p>
              Create the validation helper and filter component below before
              adding the listing page. The keyed component resets its controls
              when URL filters change; Clear also resets unsent edits when
              already on the unfiltered page.
            </p>
            <Snippet name="filters" />
            <Snippet name="filterControls" />
            <Snippet name="listing" />
          </section>
          <section id="queries">
            <h2>The published article listing API</h2>
            <CodeBlock
              filename="HTTP — listing example"
              code="GET /api/v1/projects/demo/articles?q=journey&tag=journal&order=desc&page=1&pageSize=12"
            />
            <ul>
              <li>
                <code>q</code>: case-insensitive search across title, excerpt,
                and Markdown body; up to 200 characters.
              </li>
              <li>
                <code>tag</code>: exact, case-insensitive tag matching; up to 60
                characters.
              </li>
              <li>
                <code>order</code>: <code>asc</code> or <code>desc</code>, using
                the editable article date.
              </li>
              <li>
                <code>page</code>: 1–100000. <code>pageSize</code>: 1–100,
                default 12.
              </li>
            </ul>
            <p>
              The response contains <code>items</code>, <code>total</code>,{" "}
              <code>page</code>, and <code>pageSize</code>. Only published
              articles appear. A successful empty result is different from a
              storage failure; let failures reach the error boundary rather than
              presenting them as an empty blog.
            </p>
          </section>
        </>
      )}
      {name === "article-page" && (
        <>
          <section id="route">
            <h2>A complete article route</h2>
            <p>
              Use the{" "}
              <Link href="/developers/nextjs/setup#helper">
                server-only helper
              </Link>{" "}
              and styles from setup. This file renders the story and supplies
              metadata from the same published record. Its async{" "}
              <code>params</code> match the current App Router interface.
            </p>
            <Snippet name="article" />
          </section>
          <section id="markdown">
            <h2>Safe Markdown and public media</h2>
            <p>
              <code>react-markdown</code> renders the body with raw HTML
              disabled through <code>skipHtml</code>, and its default URL
              handling rejects unsafe schemes. <code>remark-gfm</code> adds
              tables, task lists, and other GitHub-flavored Markdown features.
              Do not add raw HTML plugins or replace safe URL handling with an
              unrestricted transform.
            </p>
            <p>
              Postparticle resolves valid media references into delivery URLs
              during publishing. The API supplies <code>coverUrl</code> and{" "}
              <code>socialImageUrl</code>; it does not return private object
              keys. Markdown image alt text comes from the article body. The
              example uses the article title as cover alt text. Video references
              render as links; build your own player if desired.
            </p>
          </section>
          <section id="errors">
            <h2>Missing stories and storage errors</h2>
            <p>
              The helper returns a Next.js 404 when the article is missing or
              unpublished. HTTP 400, HTTP 503, and network failures propagate
              instead of masquerading as a missing story. Add your website’s{" "}
              <code>app/error.tsx</code> for recoverable error messaging.
            </p>
            <p>
              Published stories remain unchanged while editors save new drafts.
              Your website only sees those edits after an explicit republish,
              subject to its cache settings.
            </p>
          </section>
        </>
      )}
      {name === "seo" && (
        <>
          <section id="metadata">
            <h2>Canonical URLs, social previews, and Article JSON-LD</h2>
            <p>
              The{" "}
              <Link href="/developers/nextjs/article-page#route">
                complete article route
              </Link>{" "}
              already includes <code>generateMetadata</code> and JSON-LD. SEO
              title and description fall back to the article title and excerpt;
              the social image falls back to its cover. <code>WEBSITE_URL</code>{" "}
              points to your public website, not the CRM.
            </p>
            <p>
              The implementation includes canonical, Open Graph, and Twitter
              metadata, along with author and publication/modification
              timestamps. It escapes <code>&lt;</code> in JSON-LD before
              inserting the script, preventing article text from closing the
              script tag.
            </p>
            <p>
              Content and metadata are rendered on the server, so the initial
              HTML contains the article. Do not move fetching into a client-only
              effect if you want this behavior.
            </p>
          </section>
          <section id="sitemap">
            <h2>Include every published article</h2>
            <p>
              This sitemap traverses all API pages, fetching up to 100 stories
              per request. Using only the first page would omit older articles.
            </p>
            <Snippet name="sitemap" />
            <p>
              Enable indexing on the consuming website with its own robots file.
              The CRM and these developer guides retain their noindex policy; do
              not copy the CRM’s noindex headers into your public website.
            </p>
            <Snippet name="robots" />
          </section>
          <section id="freshness">
            <h2>Understand publication freshness</h2>
            <p>
              The API sends <code>Cache-Control: no-store</code>. Your website
              deliberately chooses its own server-side fetch cache with{" "}
              <code>next: &#123; revalidate: 60 &#125;</code>. After publishing
              or unpublishing, a cached page may still show its previous content
              until the cache refreshes. Revalidation can happen on a subsequent
              request; 60 seconds is an interval, not a strict delivery
              guarantee.
            </p>
            <p>
              Browser router caches and any additional CDN cache can extend that
              delay. Use <code>&#123; cache: &quot;no-store&quot; &#125;</code>{" "}
              instead of <code>next.revalidate</code> if each server request
              must fetch current content. Do not combine those options. Avoid
              build-only fetching when content must change without redeployment.
            </p>
            <p>
              Unpublishing removes API visibility, but previously cached article
              content and distributed media URLs may remain available. Choose
              caching behavior appropriate for your website.
            </p>
          </section>
        </>
      )}
    </Guide>
  );
}

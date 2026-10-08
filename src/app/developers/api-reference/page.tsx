import type { Metadata } from "next";
import Link from "next/link";
import CodeBlock from "@/components/developers/code-block";
import Guide from "@/components/developers/guide";

export const metadata: Metadata = {
  title: "API reference",
  description:
    "Public Postparticle article and document endpoints, parameters, response fields, media, errors, and caching.",
};

export default function ApiReference() {
  return (
    <Guide
      index={-1}
      title="API reference"
      intro="The public API provides read-only access to published articles and JSON documents. Requests do not require workspace credentials."
      sections={[
        { id: "endpoints", title: "Base URL and endpoints" },
        { id: "listing-parameters", title: "Article listing parameters" },
        { id: "article-response", title: "Article response fields" },
        { id: "documents", title: "Document response and visibility" },
        { id: "media", title: "Media references" },
        { id: "errors-and-cache", title: "Errors and caching" },
      ]}
    >
      <section id="endpoints">
        <h2>Base URL and endpoints</h2>
        <p>
          Append the API paths to your Postparticle deployment URL. Replace the
          path placeholders with your project ID, article slug, or document key.
          Encode each value as a URL path segment. Make these requests from your
          website server.
        </p>
        <CodeBlock
          filename="HTTP — public endpoints"
          code={
            "GET /api/v1/projects/{projectId}/articles?organizationId={organizationId}\nGET /api/v1/projects/{projectId}/articles/{slug}?organizationId={organizationId}\nGET /api/v1/projects/{projectId}/documents/{key}?organizationId={organizationId}"
          }
        />
        <p>
          The listing endpoint returns published articles that match its
          optional filters. The article endpoint returns one published article
          by slug. The document endpoint returns a named published JSON
          document.
        </p>
      </section>
      <section id="listing-parameters">
        <h2>Article listing parameters</h2>
        <ul>
          <li>
            <code>q</code> searches title, excerpt, and Markdown body without
            case sensitivity. Maximum length: 200 characters.
          </li>
          <li>
            <code>tag</code> matches a complete tag without case sensitivity.
            Maximum length: 60 characters.
          </li>
          <li>
            <code>order</code> accepts <code>asc</code> or <code>desc</code> and
            sorts by article date. Slug order breaks date ties.
          </li>
          <li>
            <code>page</code> starts at 1 and accepts values through 100000.
            <code>pageSize</code> accepts 1–100 and defaults to 12.
          </li>
        </ul>
        <CodeBlock
          filename="HTTP — filtered listing"
          code="GET /api/v1/projects/demo/articles?organizationId={organizationId}&q=journey&tag=journal&order=desc&page=1&pageSize=12"
        />
        <p>
          A listing response has <code>items</code>, <code>total</code>,{" "}
          <code>page</code>, and <code>pageSize</code> fields. Use{" "}
          <code>total</code> and <code>pageSize</code> to determine whether more
          pages remain. Omit unset parameters and encode query values with{" "}
          <code>URLSearchParams</code>.
        </p>
      </section>
      <section id="article-response">
        <h2>Article response fields</h2>
        <p>
          An article includes <code>title</code>, <code>slug</code>,{" "}
          <code>excerpt</code>, Markdown <code>body</code>, <code>author</code>,{" "}
          <code>tags</code>, <code>articleDate</code>, <code>seoTitle</code>,{" "}
          <code>seoDescription</code>, <code>createdAt</code>,{" "}
          <code>updatedAt</code>, <code>publishedAt</code>,{" "}
          <code>coverUrl</code>, and <code>socialImageUrl</code>.
        </p>
        <p>
          <code>articleDate</code> uses <code>YYYY-MM-DD</code>. Timestamp
          fields use UTC ISO strings. Use <code>seoTitle</code> and{" "}
          <code>seoDescription</code> when set; otherwise fall back to{" "}
          <code>title</code> and <code>excerpt</code>. Use{" "}
          <code>socialImageUrl</code> when available, then <code>coverUrl</code>
          .
        </p>
      </section>
      <section id="documents">
        <h2>Document response and visibility</h2>
        <p>
          A document response contains its <code>key</code>, <code>title</code>,{" "}
          <code>tags</code>, and a <code>value</code> field containing the
          document’s JSON data. The value shape depends on the document you
          publish; validate it against the schema your website expects.
        </p>
        <p>
          The public API includes published content only. Drafts, trashed
          content, accounts, events, private object keys, and credentials are
          not available through these endpoints.
        </p>
      </section>
      <section id="media">
        <h2>Media references</h2>
        <p>
          Published article Markdown and document JSON can contain media
          references. Valid references are resolved to public delivery URLs when
          the content is published. Article responses do not expose private
          object keys or internal media IDs in place of those URLs.
        </p>
        <CodeBlock
          filename="Markdown and JSON media examples"
          code={
            '![Description of image](media:asset-id)\n[Video caption](media:asset-id)\n\n{ "hero": "media:550e8400-e29b-41d4-a716-446655440000" }'
          }
        />
        <p>
          Add useful alt text to images. The example site renders video
          references as links; add a player if your website needs inline
          playback.
        </p>
      </section>
      <section id="errors-and-cache">
        <h2>Errors and caching</h2>
        <ul>
          <li>
            <code>400</code>: the request contains invalid input.
          </li>
          <li>
            <code>404</code>: the article or document is missing or unpublished.
          </li>
          <li>
            <code>503</code>: a storage or service configuration failure
            prevented the request.
          </li>
        </ul>
        <p>
          The API responds with <code>Cache-Control: no-store</code>. Your
          website chooses whether to cache server-rendered results and how to
          refresh them. A 60-second revalidation interval does not guarantee an
          update exactly 60 seconds after publication; see the{" "}
          <Link href="/developers/nextjs/metadata-and-caching#freshness">
            cache freshness guide
          </Link>
          .
        </p>
      </section>
    </Guide>
  );
}

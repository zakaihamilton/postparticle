import type { Metadata } from "next";
import Guide from "@/components/developers/guide";

export const metadata: Metadata = {
  title: "Troubleshooting",
  description:
    "Diagnose common Postparticle website integration issues, including connection, request, cache, and media problems.",
};

export default function Troubleshooting() {
  return (
    <Guide
      index={-1}
      title="Troubleshooting"
      intro="Use the response status and the checks below to narrow down common problems when a website reads published Postparticle content."
      sections={[
        { id: "connection", title: "Connection and project errors" },
        { id: "not-found", title: "404 article or document" },
        { id: "bad-request", title: "400 invalid request" },
        { id: "service-error", title: "503 or network failure" },
        { id: "stale-content", title: "Content does not update after publish" },
        { id: "media-troubleshooting", title: "Image or video is missing" },
      ]}
    >
      <section id="connection">
        <h2>Connection and project errors</h2>
        <ol>
          <li>
            Check that <code>POSTPARTICLE_URL</code> is the reachable base URL
            of the Postparticle deployment, without an extra API path.
          </li>
          <li>
            Confirm <code>POSTPARTICLE_PROJECT</code> matches the project ID
            that owns the published content.
          </li>
          <li>
            Make sure both variables are available to the website server.
            Restart the local development server after changing{" "}
            <code>.env.local</code>.
          </li>
        </ol>
        <p>
          The public content API does not use Spaces credentials or browser
          cookies. Keep any unrelated server credentials out of client code.
        </p>
      </section>
      <section id="not-found">
        <h2>404 article or document</h2>
        <ul>
          <li>Check the project ID and exact article slug or document key.</li>
          <li>Encode path values before adding them to the request URL.</li>
          <li>
            Confirm the item is published. Draft and trashed content is not
            returned by the public API.
          </li>
          <li>
            If an article was renamed, use its current slug in links and
            metadata.
          </li>
        </ul>
        <p>
          Treat a 404 as a missing page where appropriate. The Next.js example
          maps an article 404 to <code>notFound()</code>.
        </p>
      </section>
      <section id="bad-request">
        <h2>400 invalid request</h2>
        <p>Validate listing parameters before sending the API request:</p>
        <ul>
          <li>
            <code>q</code>: no more than 200 characters; <code>tag</code>: no
            more than 60 characters.
          </li>
          <li>
            <code>order</code>: <code>asc</code> or <code>desc</code>.
          </li>
          <li>
            <code>page</code>: whole number from 1 to 100000;{" "}
            <code>pageSize</code>: whole number from 1 to 100.
          </li>
          <li>
            Omit empty filters and encode query parameters with{" "}
            <code>URLSearchParams</code>.
          </li>
        </ul>
      </section>
      <section id="service-error">
        <h2>503 or network failure</h2>
        <p>
          A 503 means the request could not be served because of a storage or
          configuration problem. Check the Postparticle deployment health and
          server logs. A network failure can also indicate an incorrect host,
          DNS issue, or blocked outbound request from the website host.
        </p>
        <p>
          Handle these failures in your website’s error boundary and provide a
          retry path where it makes sense. Avoid retry loops that keep sending
          requests while the service is unavailable.
        </p>
      </section>
      <section id="stale-content">
        <h2>Content does not update after publish</h2>
        <p>
          Publishing changes the public API response. The API itself sends{" "}
          <code>Cache-Control: no-store</code>, but the website may cache its
          server-rendered route, browser router response, or CDN output.
        </p>
        <p>
          Check the website’s fetch policy and CDN configuration. Next.js
          revalidation refreshes on a later request; it is not an immediate
          purge or a precise update deadline. Use{" "}
          <code>cache: &quot;no-store&quot;</code>
          when each server request must read current content, or configure
          provider-specific cache invalidation.
        </p>
      </section>
      <section id="media-troubleshooting">
        <h2>Image or video is missing</h2>
        <ul>
          <li>
            Confirm the media reference is valid and the article or document was
            published after the media was added.
          </li>
          <li>
            Inspect the public API response for the resolved delivery URL and
            verify the website is using that URL rather than a private key.
          </li>
          <li>
            Add Markdown image alt text. The demo renders video references as
            links, so add a player if inline playback is required.
          </li>
        </ul>
      </section>
    </Guide>
  );
}

"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import type { PublicArticleMetadataIndexStatus } from "@/lib/types";
import { GuardedLink as Link } from "../navigation-guard";
import { api, Notice } from "../ui";
import styles from "../workspace.module.css";

function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed).toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

function integrationParameters(
  postparticleUrl: string,
  projectId: string,
  organizationId: string,
  websiteUrl: string,
) {
  return [
    `POSTPARTICLE_URL=${postparticleUrl}`,
    `POSTPARTICLE_PROJECT=${projectId}`,
    `POSTPARTICLE_ORGANIZATION_ID=${organizationId}`,
    `WEBSITE_URL=${websiteUrl}`,
  ].join("\n");
}

function subscribeToLocationOrigin() {
  return () => {};
}

function getLocationOrigin() {
  return window.location.origin;
}

function getServerLocationOrigin() {
  return "";
}

function PublicArticleMetadataIndexSettings({
  projectId,
  canAdmin,
  request = api,
}: {
  projectId: string;
  canAdmin: boolean;
  request?: typeof api;
}) {
  const [status, setStatus] = useState<PublicArticleMetadataIndexStatus | null>(
    null,
  );
  const [statusError, setStatusError] = useState("");
  const [indexMessage, setIndexMessage] = useState("");
  const [indexError, setIndexError] = useState("");
  const [buildingIndex, setBuildingIndex] = useState(false);

  useEffect(() => {
    let active = true;
    request<{ publicArticleMetadataIndex: PublicArticleMetadataIndexStatus }>(
      `/api/manage/projects/${projectId}/article-metadata-index`,
    )
      .then((result) => {
        if (active) setStatus(result.publicArticleMetadataIndex);
      })
      .catch((error) => {
        if (active)
          setStatusError(
            error instanceof Error
              ? error.message
              : "Could not load the public article index status.",
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, request]);

  async function buildIndex() {
    setBuildingIndex(true);
    setIndexError("");
    setIndexMessage("");
    try {
      const result = await request<{
        publicArticleMetadataIndex: PublicArticleMetadataIndexStatus;
      }>(`/api/manage/projects/${projectId}/article-metadata-index`, {
        method: "POST",
      });
      setStatusError("");
      setStatus(result.publicArticleMetadataIndex);
      const total = result.publicArticleMetadataIndex.total ?? 0;
      setIndexMessage(
        `Index ready for ${total} published article${total === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setIndexError(
        error instanceof Error
          ? error.message
          : "Could not build the public article index.",
      );
    } finally {
      setBuildingIndex(false);
    }
  }

  const description = status
    ? status.ready
      ? `${status.total ?? 0} published article${status.total === 1 ? "" : "s"} are indexed.`
      : "Build the index once to make existing published articles available through the metadata API."
    : "Check whether published articles are available through the metadata API.";

  return (
    <section className={styles.panel} aria-busy={buildingIndex}>
      <div className={styles.panelHeading}>
        <div>
          <h2>Public article index</h2>
          <p>{description}</p>
        </div>
        {canAdmin && (
          <button
            type="button"
            className={styles.secondary}
            disabled={buildingIndex}
            onClick={buildIndex}
          >
            {buildingIndex
              ? "Building index…"
              : status
                ? status.ready
                  ? "Rebuild index"
                  : "Build index"
                : "Build/Rebuild index"}
          </button>
        )}
      </div>
      {statusError ? (
        <Notice error={statusError} />
      ) : !status?.ready && !canAdmin ? (
        <Notice message="Ask a project admin to build this index once." />
      ) : null}
      {indexError || indexMessage ? (
        <Notice error={indexError} message={indexMessage} />
      ) : null}
    </section>
  );
}

export function IntegrationSettings({
  projectId,
  organizationId,
  canAdmin,
  request = api,
}: {
  projectId: string;
  organizationId: string;
  canAdmin: boolean;
  request?: typeof api;
}) {
  const postparticleUrl = useSyncExternalStore(
    subscribeToLocationOrigin,
    getLocationOrigin,
    getServerLocationOrigin,
  );
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [copyState, setCopyState] = useState<
    "idle" | "copied" | "error" | "website-required" | "website-invalid"
  >("idle");
  const websiteUrlInput = useRef<HTMLInputElement>(null);

  const normalizedWebsiteUrl = normalizeWebsiteUrl(websiteUrl);
  const promptDetails = integrationParameters(
    postparticleUrl || "Detecting current URL…",
    projectId,
    organizationId,
    normalizedWebsiteUrl || "Enter your public website URL below",
  );

  async function copyPromptDetails() {
    if (!normalizedWebsiteUrl) {
      setCopyState("website-required");
      websiteUrlInput.current?.focus();
      return;
    }

    try {
      const parsedUrl = new URL(normalizedWebsiteUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol))
        throw new Error("Use an HTTP or HTTPS URL.");
    } catch {
      setCopyState("website-invalid");
      websiteUrlInput.current?.focus();
      return;
    }

    try {
      await navigator.clipboard.writeText(
        integrationParameters(
          postparticleUrl || window.location.origin,
          projectId,
          organizationId,
          normalizedWebsiteUrl,
        ),
      );
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

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
      <section
        className={`${styles.panel} ${styles.panelWithTooltip}`}
        aria-labelledby="integration-parameters-heading"
      >
        <div className={styles.panelHeading}>
          <div>
            <h2 id="integration-parameters-heading">
              AI integration parameters
            </h2>
            <p>
              Copy these details and paste them above the AI integration prompt.
            </p>
          </div>
          <div className={styles.integrationCopyControl}>
            <button
              type="button"
              className={styles.integrationCopyButton}
              aria-label={
                copyState === "copied"
                  ? "AI integration parameters copied"
                  : copyState === "error"
                    ? "Retry copying AI integration parameters"
                    : "Copy AI integration parameters"
              }
              aria-describedby="integration-parameters-tooltip"
              onClick={copyPromptDetails}
            >
              {copyState === "copied" ? (
                <Check size={18} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Copy size={18} strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
            <span
              id="integration-parameters-tooltip"
              className={styles.integrationCopyTooltip}
              role="tooltip"
            >
              {copyState === "copied"
                ? "Copied"
                : copyState === "error"
                  ? "Copy failed. Try again"
                  : "Copy prompt details"}
            </span>
          </div>
        </div>
        <div className={styles.formSection}>
          <p className={styles.subtitle}>
            Postparticle values are filled in from this workspace. Enter the
            public base URL of the website you’re connecting.
          </p>
          <label className={styles.integrationWebsiteField}>
            <span>
              Public website URL <code>WEBSITE_URL</code>
            </span>
            <input
              ref={websiteUrlInput}
              type="url"
              value={websiteUrl}
              placeholder="https://journal.example.com"
              aria-invalid={
                copyState === "website-required" ||
                copyState === "website-invalid"
              }
              aria-describedby="integration-website-help"
              onChange={(event) => {
                setWebsiteUrl(event.target.value);
                if (
                  copyState === "website-required" ||
                  copyState === "website-invalid"
                )
                  setCopyState("idle");
              }}
            />
            <small
              id="integration-website-help"
              className={
                copyState === "website-required" ||
                copyState === "website-invalid"
                  ? styles.integrationWebsiteError
                  : undefined
              }
            >
              {copyState === "website-required"
                ? "Enter your public website URL before copying."
                : copyState === "website-invalid"
                  ? "Enter a valid URL starting with http:// or https://."
                  : "Use the base URL readers will visit, without a trailing slash."}
            </small>
          </label>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Focus enables keyboard scrolling of integration parameters. */}
          <pre className={styles.codeBlock} tabIndex={0}>
            {promptDetails}
          </pre>
          <span className={styles.srOnly} role="status" aria-live="polite">
            {copyState === "copied"
              ? "AI integration parameters copied to clipboard."
              : copyState === "error"
                ? "Could not copy AI integration parameters. Try again."
                : copyState === "website-required"
                  ? "Enter your public website URL before copying the parameters."
                  : copyState === "website-invalid"
                    ? "Enter a valid public website URL before copying the parameters."
                    : ""}
          </span>
          <p className={styles.subtitle}>
            Paste these details above the{" "}
            <Link href="/developers/nextjs/setup#existing-project">
              AI integration prompt
            </Link>
            .
          </p>
        </div>
      </section>
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
            `/api/v1/projects/${projectId}/articles?organizationId=${organizationId}&q=&tag=&order=desc&page=1&pageSize=12`,
            `/api/v1/projects/${projectId}/articles/{slug}?organizationId=${organizationId}`,
            `/api/v1/projects/${projectId}/documents/{key}?organizationId=${organizationId}`,
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
      <PublicArticleMetadataIndexSettings
        projectId={projectId}
        canAdmin={canAdmin}
        request={request}
      />
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

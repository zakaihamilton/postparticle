"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { GuardedLink as Link } from "../navigation-guard";
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

export function IntegrationSettings({
  projectId,
  organizationId,
}: {
  projectId: string;
  organizationId: string;
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

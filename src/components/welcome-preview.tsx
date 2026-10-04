"use client";

import { useState } from "react";
import { Icon } from "./ui";
import styles from "@/app/welcome.module.css";

export function WelcomePreview() {
  const [published, setPublished] = useState(false);
  return (
    <div className={styles.preview}>
      <div className={styles.previewBar}>
        <span>
          <i /> Field journal
        </span>
        <span>INTERACTIVE PREVIEW</span>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.landscape} aria-hidden="true">
          <div className={styles.sun} />
          <div className={styles.ridge} />
          <div className={styles.foreground} />
          <span>35° N / FIELD NOTES</span>
        </div>
        <div className={styles.articleMeta}>JOURNAL / 06 OCTOBER</div>
        <h2>The long way home.</h2>
        <p>A detour, an open road, and a few things we nearly missed.</p>
        <div className={styles.tags}>
          <span>Travel</span>
          <span>Field notes</span>
        </div>
        <div className={styles.publishRow}>
          <span role="status">
            {published
              ? "Published · visible to your website"
              : "Draft · only visible to your team"}
          </span>
          <button onClick={() => setPublished(!published)}>
            {published ? "Back to draft" : "Publish preview"}
            <Icon name={published ? "check" : "arrow"} size={14} />
          </button>
        </div>
      </div>
      <div className={styles.delivery} data-published={published}>
        <Icon name="globe" size={18} />
        <div>
          <strong>
            {published
              ? "Your website has a new story."
              : "Your website waits for your say."}
          </strong>
          <span>
            {published
              ? "The published version is ready to fetch."
              : "Edits stay private until you publish."}
          </span>
        </div>
        <span className={styles.deliveryDot} />
      </div>
    </div>
  );
}

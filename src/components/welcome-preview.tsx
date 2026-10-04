"use client";
import { useState } from "react";
import { Icon } from "./ui";
import styles from "@/app/welcome.module.css";
export function WelcomePreview() {
  const [published, setPublished] = useState(false);
  return (
    <div className={styles.productWindow}>
      <div className={styles.windowBar}>
        <span className={styles.windowDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>Demo workspace / Articles</span>
        <span className={styles.demoLabel}>Interactive demonstration</span>
      </div>
      <div className={styles.workspaceGrid}>
        <div className={styles.previewSidebar} aria-hidden="true">
          <div className={styles.demoProject}>
            <span>P</span>
            <div>
              Demo Studio<small>Content workspace</small>
            </div>
          </div>
          {[
            ["grid", "Overview"],
            ["article", "Articles"],
            ["image", "Media"],
            ["code", "Documents"],
            ["users", "Members"],
          ].map(([icon, title]) => (
            <div key={title} data-active={title === "Articles"}>
              <Icon name={icon} size={16} />
              {title}
            </div>
          ))}
          <span className={styles.previewStorage}>
            <Icon name="lock" size={14} />
            Private storage
          </span>
        </div>
        <div className={styles.articleQueue}>
          <div className={styles.queueHeading}>
            <strong>Articles</strong>
            <span>03</span>
          </div>
          {[
            "A new perspective",
            "Inside the process",
            "Notes from the studio",
          ].map((title, i) => (
            <div
              key={title}
              className={styles.queueItem}
              data-selected={i === 0}
            >
              <span>{i === 0 ? "Selected article" : "Draft"}</span>
              <strong>{title}</strong>
              <small>
                {["Oct 04, 2026", "Sep 28, 2026", "Sep 22, 2026"][i]}
              </small>
            </div>
          ))}
        </div>
        <div className={styles.articleEditor}>
          <div className={styles.editorTop}>
            <span>
              <Icon name="article" size={14} />
              ARTICLE EDITOR
            </span>
            <span className={styles.saved}>
              <Icon name="check" size={13} />
              Draft saved
            </span>
          </div>
          <div className={styles.coverGraphic} aria-hidden="true">
            <span />
            <i />
            <b />
            <div>STUDIO / FIELD NOTES</div>
          </div>
          <div className={styles.editorMeta}>
            <span>Demo Editorial</span>
            <span>04 October 2026</span>
          </div>
          <h2>A new perspective</h2>
          <p>A look at the ideas, people, and details behind the work.</p>
          <div className={styles.previewTags}>
            <span>Design</span>
            <span>Studio</span>
            <span>Ideas</span>
          </div>
          <div className={styles.seoPreview}>
            <Icon name="globe" size={16} />
            <div>
              <strong>Ready for your website</strong>
              <span>Title, description, and social image configured</span>
            </div>
            <Icon name="check" size={16} />
          </div>
          <div className={styles.publishRow}>
            <span
              role="status"
              className={
                published ? styles.publishedStatus : styles.draftStatus
              }
            >
              {published
                ? "Published · visible to your website"
                : "Draft · only visible to your team"}
            </span>
            <button
              type="button"
              onClick={() => setPublished((value) => !value)}
            >
              {published ? "Back to draft" : "Publish preview"}
              <Icon name={published ? "check" : "arrow"} size={15} />
            </button>
          </div>
        </div>
      </div>
      <div
        key={String(published)}
        className={styles.delivery}
        data-published={published}
      >
        <div>
          <Icon name="lock" size={16} />
          <span>Private workspace</span>
        </div>
        <span className={styles.deliveryTrack} aria-hidden="true">
          <i />
        </span>
        <div>
          <Icon name="globe" size={18} />
          <span>
            {published
              ? "Published version ready to fetch"
              : "Your website waits until you publish"}
          </span>
        </div>
      </div>
    </div>
  );
}

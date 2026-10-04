import Link from "next/link";
import { Icon } from "../ui";
import { nextjsGuideSequence } from "./topics";
import styles from "./developers.module.css";
export default function Guide({
  index,
  group,
  title,
  intro,
  sections,
  children,
}: {
  index: number;
  group?: "nextjs";
  title: string;
  intro: string;
  sections: { id: string; title: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/developers">Developers</Link>
        {group === "nextjs" && (
          <>
            <span>/</span>
            <span>Next.js</span>
            <span>/</span>
          </>
        )}
        {group !== "nextjs" && <span>/</span>}
        <span aria-current="page">{title}</span>
      </nav>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>
          {group === "nextjs" ? "NEXT.JS APP ROUTER" : "DEVELOPER GUIDES"}
        </span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <nav className={styles.contents} aria-label="On this page">
        <strong>On this page</strong>
        {sections.map((s) => (
          <Link key={s.id} href={`#${s.id}`}>
            {s.title}
          </Link>
        ))}
      </nav>
      <div className={styles.prose}>{children}</div>
      {group === "nextjs" && (
        <nav className={styles.pagination} aria-label="Guide pagination">
          {index > 0 ? (
            <Link href={nextjsGuideSequence[index - 1].href}>
              <Icon name="arrow-left" size={16} />
              <span>
                <small>Previous</small>
                {nextjsGuideSequence[index - 1].title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {index < nextjsGuideSequence.length - 1 && (
            <Link href={nextjsGuideSequence[index + 1].href}>
              <span>
                <small>Next</small>
                {nextjsGuideSequence[index + 1].title}
              </span>
              <Icon name="arrow" size={16} />
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

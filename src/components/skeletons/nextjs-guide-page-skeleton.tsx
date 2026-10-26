"use client";

import { usePathname } from "next/navigation";
import styles from "./skeletons.module.css";
import { LoadingPage, Skeleton, SkeletonLines } from "./skeleton-primitives";

const guideShapes: Record<
  string,
  { sections: number; codeSections: number[] }
> = {
  setup: { sections: 5, codeSections: [0, 1, 2, 3, 4] },
  articles: { sections: 3, codeSections: [0, 1, 2] },
  "article-pages": { sections: 3, codeSections: [0, 1, 2] },
  "metadata-and-caching": { sections: 3, codeSections: [0, 1, 2] },
} as const;

export default function NextjsGuidePageSkeleton() {
  const pathname = usePathname();
  const slug = pathname.split("/").filter(Boolean).at(-1) ?? "setup";
  const shape = guideShapes[slug] ?? guideShapes.setup;

  return (
    <LoadingPage label="Loading Next.js integration guide">
      <div className={styles.guideBreadcrumb}>
        <Skeleton width={75} height={11} />
        <Skeleton width={8} height={8} radius="50%" />
        <Skeleton width={72} height={11} />
        <Skeleton width={8} height={8} radius="50%" />
        <Skeleton width={118} height={11} />
      </div>
      <div className={styles.guideHeading}>
        <Skeleton width={132} height={10} />
        <Skeleton width="67%" height={43} />
        <SkeletonLines count={3} widths={["96%", "90%", "68%"]} height={13} />
      </div>
      <div className={styles.guideContents}>
        <Skeleton width={123} height={12} />
        {Array.from({ length: shape.sections }, (_, item) => (
          <Skeleton
            key={item}
            width={`${108 + (item % 3) * 19}px`}
            height={11}
          />
        ))}
      </div>
      {Array.from({ length: shape.sections }, (_, section) => (
        <section className={styles.guideSection} key={section}>
          <Skeleton
            width={`${[241, 278, 217, 245, 192][section]}px`}
            height={26}
          />
          <SkeletonLines
            count={section === 1 ? 3 : 2}
            widths={["98%", "91%", "76%"]}
          />
          {shape.codeSections.includes(section) && (
            <div className={styles.codeSkeleton}>
              <Skeleton width="38%" height={10} />
              {[0, 1, 2, 3, 4].map((line) => (
                <Skeleton key={line} width={`${93 - line * 8}%`} height={10} />
              ))}
            </div>
          )}
          {section === 1 && shape.sections > 3 && (
            <div className={styles.guideCard}>
              <Skeleton width="41%" height={11} />
              <SkeletonLines count={3} widths={["95%", "82%", "61%"]} />
            </div>
          )}
        </section>
      ))}
    </LoadingPage>
  );
}

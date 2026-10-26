import styles from "./skeletons.module.css";
import { LoadingPage, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function ApiReferencePageSkeleton() {
  return (
    <LoadingPage label="Loading API reference">
      <div className={styles.guideBreadcrumb}>
        <Skeleton width={75} height={11} />
        <Skeleton width={8} height={8} radius="50%" />
        <Skeleton width={90} height={11} />
      </div>
      <div className={styles.guideHeading}>
        <Skeleton width={147} height={10} />
        <Skeleton width="48%" height={43} />
        <SkeletonLines count={3} widths={["98%", "91%", "72%"]} height={13} />
      </div>
      <div className={styles.guideContents}>
        <Skeleton width={123} height={12} />
        {[0, 1, 2, 3, 4, 5, 6].map((item) => (
          <Skeleton
            key={item}
            width={[140, 133, 155, 122, 113, 97, 120][item]}
            height={11}
          />
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5, 6].map((section) => (
        <section className={styles.guideSection} key={section}>
          <Skeleton
            width={`${[235, 198, 225, 179, 234, 165, 173][section]}px`}
            height={26}
          />
          <SkeletonLines
            count={section === 2 || section === 6 ? 3 : 2}
            widths={["97%", "89%", "68%"]}
          />
          {[0, 1, 4].includes(section) && (
            <div className={styles.codeSkeleton}>
              <Skeleton width="32%" height={10} />
              {[0, 1, 2, 3].map((line) => (
                <Skeleton key={line} width={`${90 - line * 11}%`} height={10} />
              ))}
            </div>
          )}
          {[2, 6].includes(section) && (
            <div className={styles.guideList}>
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} width={`${95 - item * 9}%`} height={11} />
              ))}
            </div>
          )}
        </section>
      ))}
    </LoadingPage>
  );
}

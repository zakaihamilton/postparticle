import styles from "./skeletons.module.css";
import { LoadingPage, Skeleton, SkeletonLines } from "./skeleton-primitives";

const sectionWidths = [229, 193, 149, 221, 252, 204];

export default function TroubleshootingPageSkeleton() {
  return (
    <LoadingPage label="Loading troubleshooting guide">
      <div className={styles.guideBreadcrumb}>
        <Skeleton width={75} height={11} />
        <Skeleton width={8} height={8} radius="50%" />
        <Skeleton width={115} height={11} />
      </div>
      <div className={styles.guideHeading}>
        <Skeleton width={147} height={10} />
        <Skeleton width="44%" height={43} />
        <SkeletonLines count={3} widths={["96%", "87%", "68%"]} height={13} />
      </div>
      <div className={styles.guideContents}>
        <Skeleton width={123} height={12} />
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <Skeleton
            key={item}
            width={[166, 145, 124, 141, 164, 137][item]}
            height={11}
          />
        ))}
      </div>
      {sectionWidths.map((width, section) => (
        <section className={styles.guideSection} key={width}>
          <Skeleton width={`${width}px`} height={26} />
          {section === 0 || section === 1 || section === 2 || section === 5 ? (
            <div className={styles.guideList}>
              {[0, 1, 2, ...(section === 0 || section === 1 ? [3] : [])].map(
                (item) => (
                  <Skeleton
                    key={item}
                    width={`${96 - item * 6}%`}
                    height={12}
                  />
                ),
              )}
            </div>
          ) : (
            <SkeletonLines count={3} widths={["98%", "89%", "75%"]} />
          )}
          {section === 0 || section === 1 ? (
            <SkeletonLines count={2} widths={["88%", "63%"]} />
          ) : null}
        </section>
      ))}
    </LoadingPage>
  );
}

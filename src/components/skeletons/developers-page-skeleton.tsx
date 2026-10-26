import styles from "./skeletons.module.css";
import { LoadingPage, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function DevelopersPageSkeleton() {
  return (
    <LoadingPage label="Loading developer guides">
      <div className={styles.guideBreadcrumb}>
        <Skeleton width={75} height={11} />
        <Skeleton width={8} height={8} radius="50%" />
        <Skeleton width={117} height={11} />
      </div>
      <div className={styles.guideHeading}>
        <Skeleton width={147} height={10} />
        <Skeleton width="73%" height={43} />
        <SkeletonLines count={3} widths={["92%", "88%", "59%"]} height={13} />
      </div>
      <div className={styles.guideContents}>
        <Skeleton width={123} height={12} />
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} width={[104, 142, 118, 111][item]} height={11} />
        ))}
      </div>
      <section className={styles.guideSection}>
        <Skeleton width={155} height={26} />
        <SkeletonLines count={3} widths={["97%", "92%", "79%"]} />
        <div className={styles.guideList}>
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} width={`${94 - item * 8}%`} height={12} />
          ))}
        </div>
      </section>
      <section className={styles.guideSection}>
        <Skeleton width={242} height={26} />
        <SkeletonLines count={2} widths={["94%", "73%"]} />
        <div className={styles.guideCards}>
          {[0, 1, 2, 3].map((card) => (
            <div className={styles.guideCard} key={card}>
              <div className={styles.identity}>
                <Skeleton width={22} height={22} radius={4} />
                <Skeleton width={`${58 + card * 5}%`} height={13} />
              </div>
              <SkeletonLines count={2} widths={["100%", "77%"]} height={10} />
            </div>
          ))}
        </div>
      </section>
      {[0, 1].map((section) => (
        <section className={styles.guideSection} key={section}>
          <Skeleton width={section ? 190 : 212} height={26} />
          <SkeletonLines count={3} widths={["97%", "88%", "70%"]} />
        </section>
      ))}
    </LoadingPage>
  );
}

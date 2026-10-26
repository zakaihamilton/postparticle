import styles from "../app/skeletons.module.css";
import { LoadingStatus, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function HomePageSkeleton() {
  return (
    <LoadingStatus label="Loading latest articles">
      <div className={styles.homeHeading}>
        <Skeleton width={101} height={11} />
        <div className={styles.homeTitle}>
          <Skeleton width={245} height={63} />
          <Skeleton width={304} height={63} />
        </div>
      </div>
      <div className={styles.introLines}>
        <SkeletonLines widths={["100%", "86%"]} height={14} />
      </div>
      <Skeleton width={178} height={27} className={styles.sectionTitle} />
      <div className={styles.cards}>
        {[0, 1, 2].map((card) => (
          <article className={styles.card} key={card}>
            <Skeleton className={styles.cover} />
            <Skeleton width={93} height={10} />
            <Skeleton width={`${76 - card * 5}%`} height={26} />
            <SkeletonLines widths={["100%", "91%", "67%"]} height={11} />
            <Skeleton width={93} height={11} />
          </article>
        ))}
      </div>
      <Skeleton width={95} height={13} className={styles.allArticles} />
    </LoadingStatus>
  );
}

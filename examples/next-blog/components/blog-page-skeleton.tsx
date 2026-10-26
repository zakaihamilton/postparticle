import styles from "../app/skeletons.module.css";
import { LoadingStatus, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function BlogPageSkeleton() {
  return (
    <LoadingStatus label="Loading articles">
      <Skeleton width={240} height={52} />
      <div className={styles.filters}>
        {[0, 1, 2].map((field) => (
          <div className={styles.filterField} key={field}>
            <Skeleton width={[58, 53, 74][field]} height={11} />
            <Skeleton className={styles.filterInput} />
          </div>
        ))}
        <Skeleton className={styles.filterButton} />
      </div>
      <div className={styles.cards}>
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <article className={styles.card} key={card}>
            <Skeleton width={89} height={10} />
            <Skeleton width={`${78 - (card % 3) * 7}%`} height={25} />
            <SkeletonLines widths={["100%", "87%", "72%"]} height={11} />
            <div className={styles.tags}>
              <Skeleton width={63} height={24} />
              <Skeleton width={77} height={24} />
            </div>
          </article>
        ))}
      </div>
      <div className={styles.pagination}>
        <Skeleton width={102} height={14} />
        <Skeleton width={76} height={14} />
      </div>
    </LoadingStatus>
  );
}

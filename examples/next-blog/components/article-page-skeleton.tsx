import styles from "../app/skeletons.module.css";
import { LoadingStatus, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function ArticlePageSkeleton() {
  return (
    <LoadingStatus label="Loading article">
      <article className={styles.article}>
        <Skeleton width={105} height={13} />
        <div className={styles.articleTitle}>
          <Skeleton width="94%" height={53} />
          <Skeleton width="67%" height={53} />
        </div>
        <Skeleton width={185} height={11} className={styles.articleMeta} />
        <Skeleton className={styles.articleCover} />
        <div className={styles.articleBody}>
          <SkeletonLines widths={["100%", "96%", "89%", "72%"]} height={12} />
          <Skeleton
            width="57%"
            height={27}
            className={styles.articleSubheading}
          />
          <SkeletonLines widths={["97%", "92%", "82%", "74%"]} height={12} />
          <div className={styles.codeBlock}>
            <Skeleton width="94%" height={11} />
            <Skeleton width="82%" height={11} />
            <Skeleton width="73%" height={11} />
            <Skeleton width="90%" height={11} />
          </div>
          <SkeletonLines widths={["100%", "95%", "87%", "63%"]} height={12} />
        </div>
        <div className={styles.tags}>
          <Skeleton width={64} height={25} />
          <Skeleton width={78} height={25} />
          <Skeleton width={57} height={25} />
        </div>
      </article>
    </LoadingStatus>
  );
}

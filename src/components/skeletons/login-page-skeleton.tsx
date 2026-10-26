import styles from "./skeletons.module.css";
import { LoadingPage, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function LoginPageSkeleton() {
  return (
    <LoadingPage label="Loading sign-in page">
      <div className={styles.authPage}>
        <header className={styles.authHeader}>
          <div className={styles.brand}>
            <Skeleton width={32} height={32} radius={6} />
            <Skeleton width={132} height={20} />
          </div>
          <Skeleton width={142} height={36} radius={6} />
        </header>
        <main className={styles.authLayout}>
          <section className={styles.authStory}>
            <Skeleton width={185} height={11} />
            <div className={styles.heroTitleLines}>
              <Skeleton width="88%" height={46} />
              <Skeleton width="72%" height={46} />
            </div>
            <SkeletonLines count={2} widths={["91%", "67%"]} height={14} />
            <Skeleton className={styles.authImage} height="auto" />
            <div className={styles.projectNote}>
              <Skeleton width={16} height={16} radius={4} />
              <Skeleton width="75%" height={11} />
            </div>
          </section>
          <section className={styles.authForm}>
            <Skeleton width={38} height={38} radius={8} />
            <Skeleton width="70%" height={31} />
            <SkeletonLines count={2} widths={["100%", "78%"]} />
            <Skeleton width="100%" height={48} radius={5} />
            <div className={styles.authDivider}>
              <Skeleton width={135} height={10} />
            </div>
            <div className={styles.authField}>
              <Skeleton width={70} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
            <div className={styles.authField}>
              <Skeleton width={62} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
            <Skeleton width="100%" height={47} radius={5} />
            <Skeleton width="90%" height={12} />
            <Skeleton width={120} height={13} />
          </section>
        </main>
      </div>
    </LoadingPage>
  );
}

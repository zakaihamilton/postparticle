import styles from "./skeletons.module.css";
import { AccountFrame, HeadingSkeleton, Skeleton } from "./skeleton-primitives";

export default function ResetPlatformAccountPageSkeleton() {
  return (
    <AccountFrame
      label="Loading password reset form"
      active="platform-accounts"
      title="Platform accounts"
    >
      <HeadingSkeleton titleWidth="57%" descriptionWidth="65%" action />
      <section className={styles.skeletonPanel}>
        <div className={styles.panelBody}>
          <div className={styles.field}>
            <Skeleton width={127} height={12} />
            <Skeleton className={styles.inputSkeleton} />
          </div>
          <div className={styles.formColumns}>
            <div className={styles.field}>
              <Skeleton width={116} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
            <div className={styles.field}>
              <Skeleton width={98} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
          </div>
          <Skeleton width={148} height={42} radius={5} />
        </div>
      </section>
    </AccountFrame>
  );
}

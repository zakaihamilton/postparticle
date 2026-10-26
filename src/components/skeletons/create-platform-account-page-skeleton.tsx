import styles from "./skeletons.module.css";
import { AccountFrame, HeadingSkeleton, Skeleton } from "./skeleton-primitives";

export default function CreatePlatformAccountPageSkeleton() {
  return (
    <AccountFrame
      label="Loading create account form"
      active="platform-accounts"
      title="Platform accounts"
    >
      <HeadingSkeleton titleWidth="38%" descriptionWidth="66%" action />
      <section className={styles.skeletonPanel}>
        <div className={styles.panelBody}>
          <div className={styles.formColumns}>
            <div className={styles.field}>
              <Skeleton width={115} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
            <div className={styles.field}>
              <Skeleton width={112} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
          </div>
          <Skeleton width={137} height={42} radius={5} />
        </div>
      </section>
    </AccountFrame>
  );
}

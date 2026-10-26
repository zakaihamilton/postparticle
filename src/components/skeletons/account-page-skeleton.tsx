import styles from "./skeletons.module.css";
import { AccountFrame, HeadingSkeleton, Skeleton } from "./skeleton-primitives";

export default function AccountPageSkeleton() {
  return (
    <AccountFrame
      label="Loading account settings"
      active="account"
      title="Your account"
    >
      <HeadingSkeleton titleWidth="44%" descriptionWidth="51%" />
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <Skeleton width={146} height={17} />
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formColumns}>
            <div className={styles.field}>
              <Skeleton width={117} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
            <div className={styles.field}>
              <Skeleton width={102} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
          </div>
          <Skeleton width="70%" height={11} />
          <Skeleton width={144} height={42} radius={5} />
        </div>
      </section>
    </AccountFrame>
  );
}

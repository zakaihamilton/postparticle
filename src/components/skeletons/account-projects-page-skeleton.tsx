import styles from "./skeletons.module.css";
import { AccountFrame, HeadingSkeleton, Skeleton } from "./skeleton-primitives";

export default function AccountProjectsPageSkeleton() {
  return (
    <AccountFrame
      label="Loading project settings"
      active="projects"
      title="Projects"
    >
      <HeadingSkeleton titleWidth="39%" descriptionWidth="67%" />
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <div className={styles.headingCopy}>
            <Skeleton width={142} height={17} />
            <Skeleton width={238} height={11} />
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.field}>
            <Skeleton width={76} height={12} />
            <Skeleton className={styles.inputSkeleton} />
            <Skeleton width="67%" height={10} />
            <Skeleton width="73%" height={10} />
          </div>
          <div className={styles.formColumns}>
            <div className={styles.field}>
              <Skeleton width={47} height={12} />
              <Skeleton className={styles.inputSkeleton} />
            </div>
            <div className={styles.field}>
              <Skeleton width={78} height={12} />
              <Skeleton className={styles.textareaSkeleton} />
            </div>
          </div>
          <Skeleton width={132} height={40} radius={5} />
        </div>
      </section>
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <div className={styles.headingCopy}>
            <Skeleton width={135} height={17} />
            <Skeleton width={92} height={11} />
          </div>
          <Skeleton width={78} height={32} radius={5} />
        </div>
        <div className={styles.accountRows}>
          {[0, 1, 2].map((row) => (
            <div className={styles.accountRow} key={row}>
              <div className={styles.identity}>
                <Skeleton width={38} height={38} radius={7} />
                <div className={styles.identityLines}>
                  <Skeleton width={row === 1 ? 180 : 132} height={13} />
                  <Skeleton width="70%" height={10} />
                </div>
              </div>
              <div className={styles.rowActions}>
                <Skeleton width={93} height={34} radius={5} />
                <Skeleton width={82} height={34} radius={5} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </AccountFrame>
  );
}

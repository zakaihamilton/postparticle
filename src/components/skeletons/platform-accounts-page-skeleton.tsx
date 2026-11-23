import accountStyles from "./account-skeletons.module.css";
import { AccountFrame, HeadingSkeleton, Skeleton } from "./skeleton-primitives";
import styles from "./skeleton-primitives.module.css";

export default function PlatformAccountsPageSkeleton() {
  return (
    <AccountFrame
      label="Loading platform accounts"
      active="platform-accounts"
      title="Platform accounts"
    >
      <HeadingSkeleton titleWidth="29%" descriptionWidth="56%" action />
      <section className={styles.skeletonPanel}>
        <div className={styles.panelHeading}>
          <div className={styles.headingCopy}>
            <Skeleton width={132} height={17} />
            <Skeleton width={94} height={11} />
          </div>
          <Skeleton width={82} height={34} radius={5} />
        </div>
        <div className={accountStyles.accountRows}>
          {[0, 1, 2].map((row) => (
            <div className={accountStyles.accountRow} key={row}>
              <div className={styles.identity}>
                <Skeleton width={38} height={38} radius="50%" />
                <div className={styles.identityLines}>
                  <Skeleton width={row === 1 ? 171 : 126} height={13} />
                  <Skeleton width={row === 1 ? 142 : 91} height={10} />
                </div>
              </div>
              <div className={accountStyles.rowActions}>
                <Skeleton width={133} height={34} radius={5} />
                <Skeleton width={104} height={34} radius={5} />
                <Skeleton width={118} height={34} radius={5} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </AccountFrame>
  );
}

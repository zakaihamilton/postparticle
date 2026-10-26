import styles from "./skeletons.module.css";
import { AccountFrame, Skeleton, SkeletonLines } from "./skeleton-primitives";

export default function ProjectsPageSkeleton() {
  return (
    <AccountFrame
      label="Loading your workspaces"
      active="workspaces"
      title="Workspaces"
    >
      <div className={styles.headingCopy}>
        <Skeleton width={118} height={10} />
        <Skeleton width="55%" height={35} />
        <Skeleton width="60%" height={13} />
      </div>
      <Skeleton
        width={146}
        height={42}
        radius={5}
        className={styles.pickerAction}
      />
      <div className={styles.cardGrid}>
        {[0, 1, 2].map((card) => (
          <div className={styles.projectCard} key={card}>
            <div className={styles.projectCardTop}>
              <Skeleton width={38} height={38} radius={7} />
              <Skeleton width={72} height={23} radius={12} />
            </div>
            <Skeleton width="67%" height={19} />
            <SkeletonLines count={2} widths={["96%", "72%"]} height={11} />
            <div className={styles.projectCardBottom}>
              <Skeleton width={104} height={11} />
              <Skeleton width={17} height={17} />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.projectNote}>
        <Skeleton width={16} height={16} radius={4} />
        <Skeleton width="64%" height={11} />
      </div>
    </AccountFrame>
  );
}

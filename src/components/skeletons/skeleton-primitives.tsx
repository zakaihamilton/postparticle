import type { CSSProperties, ReactNode } from "react";
import styles from "./skeletons.module.css";

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 5,
  className,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${className ?? ""}`}
      style={{ width, height, borderRadius: radius }}
    />
  );
}

export function LoadingPage({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.loadingPage} aria-busy="true">
      <span className={styles.srOnly} role="status">
        {label}
      </span>
      <div className={styles.visual} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

export function AccountFrame({
  label,
  active,
  title,
  children,
}: {
  label: string;
  active: "workspaces" | "account" | "projects" | "platform-accounts";
  title: string;
  children: ReactNode;
}) {
  return (
    <LoadingPage label={label}>
      <div className={styles.accountShell}>
        <aside className={styles.accountSidebar}>
          <div className={styles.brand}>
            <Skeleton width={34} height={34} radius={6} />
            <Skeleton width={114} height={18} />
          </div>
          <div className={styles.navGroup}>
            <Skeleton width={91} height={9} />
            <AccountNavItem active={active === "workspaces"} />
            <Skeleton width={58} height={9} className={styles.navCaption} />
            <AccountNavItem active={active === "account"} />
            <AccountNavItem active={active === "projects"} />
            <AccountNavItem active={active === "platform-accounts"} />
          </div>
          <div className={styles.accountProfile}>
            <Skeleton width={36} height={36} radius="50%" />
            <div className={styles.profileCopy}>
              <Skeleton width={104} height={12} />
              <Skeleton width={72} height={10} />
            </div>
          </div>
        </aside>
        <div className={styles.accountBody}>
          <header className={styles.appTopbar}>
            <Skeleton width={title.length > 15 ? 178 : 132} height={16} />
            <div className={styles.topbarActions}>
              <Skeleton width={142} height={34} radius={6} />
              <Skeleton width={38} height={34} radius={6} />
              <Skeleton width={78} height={34} radius={6} />
            </div>
          </header>
          <main className={styles.accountMain}>{children}</main>
          <footer className={styles.appFooter}>
            <Skeleton width={200} height={10} />
            <Skeleton width={83} height={10} />
          </footer>
        </div>
      </div>
    </LoadingPage>
  );
}

function AccountNavItem({ active }: { active: boolean }) {
  return (
    <div
      className={`${styles.accountNavItem} ${active ? styles.navCurrent : ""}`}
    >
      <Skeleton width={17} height={17} radius={4} />
      <Skeleton width={active ? 112 : 96} height={12} />
    </div>
  );
}

export function HeadingSkeleton({
  titleWidth = "46%",
  descriptionWidth = "62%",
  action = false,
}: {
  titleWidth?: CSSProperties["width"];
  descriptionWidth?: CSSProperties["width"];
  action?: boolean;
}) {
  return (
    <div className={styles.pageHeading}>
      <div className={styles.headingCopy}>
        <Skeleton width={120} height={10} />
        <Skeleton width={titleWidth} height={34} radius={7} />
        <Skeleton width={descriptionWidth} height={13} />
      </div>
      {action && <Skeleton width={142} height={42} radius={5} />}
    </div>
  );
}

export function SkeletonLines({
  count = 3,
  widths = ["96%", "83%", "68%"],
  height = 12,
}: {
  count?: number;
  widths?: CSSProperties["width"][];
  height?: CSSProperties["height"];
}) {
  return (
    <div className={styles.skeletonLines}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          width={widths[index % widths.length]}
          height={height}
        />
      ))}
    </div>
  );
}

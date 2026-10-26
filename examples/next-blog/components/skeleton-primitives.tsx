import type { CSSProperties, ReactNode } from "react";
import styles from "../app/skeletons.module.css";

export function Skeleton({
  width = "100%",
  height = 12,
  className,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.block} ${className ?? ""}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonLines({
  widths,
  height = 12,
}: {
  widths: CSSProperties["width"][];
  height?: CSSProperties["height"];
}) {
  return (
    <div className={styles.lines}>
      {widths.map((width, index) => (
        <Skeleton key={index} width={width} height={height} />
      ))}
    </div>
  );
}

export function LoadingStatus({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.loading} aria-busy="true">
      <span className={styles.status} role="status">
        {label}
      </span>
      <div className={styles.visual} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { guideLinks } from "./topics";
import styles from "./developers.module.css";
export default function DeveloperNavigation() {
  const pathname = usePathname();
  return (
    <nav className={styles.topicNav} aria-label="Developer topics">
      {guideLinks.map(({ href, title, group }, i) => (
        <div className={styles.topicItem} key={href}>
          {(i === 0 || guideLinks[i - 1].group !== group) && (
            <span className={styles.topicGroup}>{group}</span>
          )}
          <Link
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {title}
          </Link>
        </div>
      ))}
    </nav>
  );
}

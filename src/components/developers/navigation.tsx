"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { guideLinks } from "./topics";
import styles from "./developers.module.css";
export default function DeveloperNavigation() {
  const pathname = usePathname();
  return (
    <nav className={styles.topicNav} aria-label="Developer topics">
      {guideLinks.map(({ href, title }, i) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
        >
          <span>0{i + 1}</span>
          {title}
        </Link>
      ))}
    </nav>
  );
}

"use client";
import { useEffect, useRef } from "react";
import styles from "@/app/welcome.module.css";
export default function WelcomeReveal({
  children,
}: {
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !window.IntersectionObserver) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const revealed = new WeakSet<Element>();
    let observer: IntersectionObserver | undefined;
    function configure() {
      observer?.disconnect();
      if (motion.matches) {
        element!
          .querySelectorAll("[data-reveal]")
          .forEach((node) => node.removeAttribute("data-entered"));
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            revealed.add(entry.target);
            entry.target.setAttribute("data-entered", "true");
            observer?.unobserve(entry.target);
          }
        },
        { threshold: 0.12 },
      );
      element!.querySelectorAll("[data-reveal]").forEach((node) => {
        if (!revealed.has(node)) observer!.observe(node);
      });
    }
    configure();
    motion.addEventListener("change", configure);
    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", configure);
    };
  }, []);
  return (
    <div ref={root} className={styles.page}>
      {children}
    </div>
  );
}

"use client";
import Link from "next/link";
import { useRef } from "react";
import styles from "../app/blog.module.css";
export default function BlogFilters({
  q,
  tag,
  dateOrder,
}: {
  q: string;
  tag: string;
  dateOrder: "asc" | "desc";
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action="/blog" className={styles.form}>
      <label>
        Search articles
        <input
          name="q"
          defaultValue={q}
          maxLength={200}
          placeholder="Enter a search term"
        />
      </label>
      <label>
        Find a tag
        <input
          name="tag"
          defaultValue={tag}
          maxLength={60}
          placeholder="ideas"
        />
      </label>
      <label>
        Date order
        <select name="order" defaultValue={dateOrder}>
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </label>
      <button>Filter</button>
      <Link href="/blog" onClick={() => form.current?.reset()}>
        Clear
      </Link>
    </form>
  );
}

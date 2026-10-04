import Link from "next/link";
import { getArticles } from "../../lib/content";
import styles from "../blog.module.css";
import BlogFilters from "../../components/blog-filters";
import { readBlogFilters, type BlogSearchParams } from "../../lib/filters";
export default async function Blog({
  searchParams,
}: {
  searchParams: Promise<BlogSearchParams>;
}) {
  const { q, tag, dateOrder, pageNumber, errors } = readBlogFilters(
    await searchParams,
  );
  const data = errors.length
    ? null
    : await getArticles({ q, tag, order: dateOrder, page: pageNumber });
  function pageHref(page: number) {
    return `/blog?${new URLSearchParams({ page: String(page), order: dateOrder, ...(q ? { q } : {}), ...(tag ? { tag } : {}) })}`;
  }
  return (
    <>
      <h1>The journal.</h1>
      <BlogFilters
        key={JSON.stringify([q, tag, dateOrder, pageNumber, errors])}
        q={q}
        tag={tag}
        dateOrder={dateOrder}
      />
      {errors.length > 0 && (
        <div className={styles.error} role="alert">
          <strong>Check your filters</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <p>
            Correct the fields and apply filters, or use Clear to start again.
          </p>
        </div>
      )}
      <div className={styles.cards}>
        {data?.items.map((a) => (
          <article key={a.slug}>
            <time dateTime={a.articleDate}>{a.articleDate}</time>
            <h2>
              <Link href={`/blog/${a.slug}`}>{a.title}</Link>
            </h2>
            <p>{a.excerpt}</p>
            <div>
              {a.tags.map((t) => (
                <Link
                  className={styles.tag}
                  key={t}
                  href={`/blog?tag=${encodeURIComponent(t)}`}
                >
                  {t}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
      {data && !data.items.length && <p>No stories match your filters.</p>}
      <nav className={styles.form} aria-label="Blog pagination">
        {data && pageNumber > 1 && (
          <Link href={pageHref(pageNumber - 1)}>← Previous</Link>
        )}
        {data && pageNumber * data.pageSize < data.total && (
          <Link href={pageHref(pageNumber + 1)}>Next →</Link>
        )}
      </nav>
    </>
  );
}

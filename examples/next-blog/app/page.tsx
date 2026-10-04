import Link from "next/link";
import { getArticles } from "../lib/content";
import styles from "./blog.module.css";
export default async function Welcome() {
  const { items } = await getArticles({ pageSize: 3 });
  return (
    <>
      <div className={styles.eyebrow}>DEMO JOURNAL</div>
      <h1>
        Latest
        <br />
        articles
      </h1>
      <p className={styles.intro}>
        A sample website that renders published articles from the Postparticle
        API.
      </p>
      <h2>Recent articles</h2>
      <div className={styles.cards}>
        {items.map((a) => (
          <article key={a.slug}>
            {a.coverUrl && <img src={a.coverUrl} alt={a.title} />}
            <time dateTime={a.articleDate}>{a.articleDate}</time>
            <h3>
              <Link href={`/blog/${a.slug}`}>{a.title}</Link>
            </h3>
            <p>{a.excerpt}</p>
            <Link href={`/blog/${a.slug}`}>Read article</Link>
          </article>
        ))}
      </div>
      {!items.length && <p>No articles have been published yet.</p>}
      <Link href="/blog">All articles</Link>
    </>
  );
}

import Link from "next/link";
import { getArticles } from "../lib/content";
import styles from "./blog.module.css";
export default async function Welcome() {
  const { items } = await getArticles({ pageSize: 3 });
  return (
    <>
      <div className={styles.eyebrow}>A PLACE FOR IDEAS</div>
      <h1>
        Notes from
        <br />a curious world.
      </h1>
      <p className={styles.intro}>
        A generic website welcome page, powered by content from Postparticle.
      </p>
      <h2>Latest stories</h2>
      <div className={styles.cards}>
        {items.map((a) => (
          <article key={a.slug}>
            {a.coverUrl && <img src={a.coverUrl} alt={a.title} />}
            <time dateTime={a.articleDate}>{a.articleDate}</time>
            <h3>
              <Link href={`/blog/${a.slug}`}>{a.title}</Link>
            </h3>
            <p>{a.excerpt}</p>
            <Link href={`/blog/${a.slug}`}>Read story →</Link>
          </article>
        ))}
      </div>
      {!items.length && <p>No stories have been published yet.</p>}
      <Link href="/blog">All stories →</Link>
    </>
  );
}

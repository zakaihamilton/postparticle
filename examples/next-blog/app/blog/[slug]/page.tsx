import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getArticle, websiteUrl } from "../../../lib/content";
import styles from "../../blog.module.css";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  const title = a.seoTitle || a.title;
  const description = a.seoDescription || a.excerpt;
  const url = `${websiteUrl}/blog/${a.slug}`;
  const image = a.socialImageUrl || a.coverUrl;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      publishedTime: a.publishedAt,
      modifiedTime: a.updatedAt,
      authors: [a.author],
      tags: a.tags,
      images: image ? [image] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
    },
  };
}
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const a = await getArticle((await params).slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.seoDescription || a.excerpt,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    author: { "@type": "Person", name: a.author },
    image: a.socialImageUrl || a.coverUrl || undefined,
    mainEntityOfPage: `${websiteUrl}/blog/${a.slug}`,
  };
  return (
    <article className={styles.article}>
      <Link href="/blog">← All stories</Link>
      <h1>{a.title}</h1>
      <div className={styles.meta}>
        <time dateTime={a.articleDate}>{a.articleDate}</time> · {a.author}
      </div>
      {a.coverUrl && <img src={a.coverUrl} alt={a.title} />}
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {a.body}
      </ReactMarkdown>
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </article>
  );
}

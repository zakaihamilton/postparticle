import type { MetadataRoute } from "next";
import { getArticles, websiteUrl } from "../lib/content";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: websiteUrl },
    { url: `${websiteUrl}/blog` },
  ];
  let page = 1;
  while (true) {
    const data = await getArticles({ page, pageSize: 100 });
    urls.push(
      ...data.items.map((a) => ({
        url: `${websiteUrl}/blog/${a.slug}`,
        lastModified: a.updatedAt,
      })),
    );
    if (page * data.pageSize >= data.total) break;
    page++;
  }
  return urls;
}

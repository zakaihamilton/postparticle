import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Postparticle — A home for your content",
    short_name: "Postparticle",
    description:
      "A thoughtful workspace for publishing articles, media, and dynamic content.",
    start_url: "/projects",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#b9dcff",
    icons: [
      {
        src: "/icons/postparticle-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/postparticle-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

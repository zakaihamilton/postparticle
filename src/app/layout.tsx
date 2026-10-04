import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Postparticle — A home for your content",
    template: "%s · Postparticle",
  },
  description:
    "A thoughtful workspace for publishing articles, media, and dynamic content.",
  robots: { index: false, follow: false },
};
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('postparticle-theme')||'system'}catch{}`;
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Source_Sans_3, Lora } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const editorial = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-editorial",
  display: "swap",
});
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
    <html
      lang="en"
      className={`${sans.variable} ${editorial.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

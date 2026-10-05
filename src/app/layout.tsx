import type { Metadata, Viewport } from "next";
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
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  applicationName: "Postparticle",
  title: {
    default: "Postparticle — A home for your content",
    template: "%s · Postparticle",
  },
  description:
    "A thoughtful workspace for publishing articles, media, and dynamic content.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Postparticle",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "Postparticle",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Postparticle — a home for your content",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#101c29" },
  ],
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

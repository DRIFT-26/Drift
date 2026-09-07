import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://drifthq.co"),
  title: {
    default: "DRIFT - Revenue Monitoring and Anomaly Detection for Operators",
    template: "%s | DRIFT",
  },
  description:
    "DRIFT catches meaningful revenue movement before it compounds. Push signals, weekly briefings, and Operator Score for multi-location operators. 30 days free, no card required.",
  openGraph: {
    title: "DRIFT - Revenue Monitoring and Anomaly Detection for Operators",
    description:
      "DRIFT catches meaningful revenue movement before it compounds. Push signals, weekly briefings, and Operator Score for multi-location operators.",
    url: "https://drifthq.co",
    siteName: "DRIFT",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "DRIFT signal preview showing revenue down 14 percent against baseline with a softening status.",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DRIFT - Revenue Monitoring and Anomaly Detection for Operators",
    description:
      "DRIFT catches meaningful revenue movement before it compounds. Push signals, weekly briefings, and Operator Score for multi-location operators.",
    images: ["/og-image.svg"],
  },
  icons: {
    icon: "/drift-v3.ico",
    shortcut: "/drift-v3.ico",
    apple: "/drift-v3.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

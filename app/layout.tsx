import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatchList",
  description: "Shared market watchlists for US stocks, Japan stocks, FX, and custom indexes."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

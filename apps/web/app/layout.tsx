import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PR Guard",
  description: "Automated first-pass pull request reviews for GitHub."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

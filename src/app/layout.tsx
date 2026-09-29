import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { HouseholdProvider } from "@/components/layout/HouseholdProvider";
import { ThemeScript } from "@/components/layout/ThemeScript";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "1ST split",
  description: "Split household expenses and settle up against a shared account.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <HouseholdProvider>{children}</HouseholdProvider>
        </div>
      </body>
    </html>
  );
}

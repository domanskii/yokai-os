import { YokaiGlobalSidebar } from "../components/yokai-global-sidebar";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { PwaRegister } from "../components/pwa-register";
import { BrowserBranding } from "../components/browser-branding";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YOKAI OS — WRAP INTELLIGENCE",
  description: "Prywatny system operacyjny YOKAI WRAP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BrowserBranding />
        <PwaRegister />
        <YokaiGlobalSidebar />{children}</body>
    </html>
  );
}

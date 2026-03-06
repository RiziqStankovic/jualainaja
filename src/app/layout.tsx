import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { LanguageProvider } from "@/context/LanguageContext";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jualaja Cloudfren | Solusi POS Cerdas UMKM",
  description: "Platform Point of Sales (POS) dan digitalisasi UMKM dari Cloudfren. Kelola stok, kasir, dan katalog produk dalam satu genggaman.",
  keywords: ["POS", "UMKM", "Aplikasi Kasir Pintar", "Retail", "Cloudfren", "Jualaja"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
        <LanguageProvider>
          <main className="mobile-container">
            <div style={{ flex: 1, paddingBottom: '80px' }}>
              {children}
            </div>
            <BottomNav />
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}

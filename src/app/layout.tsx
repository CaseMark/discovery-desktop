import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { UploadProvider } from "@/lib/upload-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Discovery Dashboard",
  description: "E-discovery document management with OCR and semantic search",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background flex flex-col`}
      >
        <UploadProvider>
          <div className="flex-1">
            {children}
          </div>
          <footer className="bg-foreground py-1.5 text-center">
            <span className="text-background text-xs">
              powered with ❤️ by <span className="font-medium">case.dev</span>
            </span>
          </footer>
        </UploadProvider>
      </body>
    </html>
  );
}

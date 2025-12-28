import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClientToaster } from "@/components/ui/client-toaster";
import { ThemeProvider } from "@/components/theme-provider";
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
  title: "Tunnet",
  description: "Modern Proxy Tool with macOS Aesthetics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="app-window" data-tauri-drag-region>
            {children}
          </div>
          <ClientToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

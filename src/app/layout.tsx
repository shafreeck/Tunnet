import type { Metadata } from "next";
import { ClientToaster } from "@/components/ui/client-toaster";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";


import { AppShell } from "@/components/layout/app-shell";

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
      <body className={`antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell>
            {children}
          </AppShell>
          <ClientToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

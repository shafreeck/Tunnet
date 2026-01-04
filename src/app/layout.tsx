import type { Metadata } from "next";
import { ClientToaster } from "@/components/ui/client-toaster";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";


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
          <div className="app-window" data-tauri-drag-region>
            {children}
          </div>
          <ClientToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

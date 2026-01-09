import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Tunnet - 为现代互联网而生的幽雅代理工具",
    description: "基于 Tauri 与 sing-box，提供跨平台的高性能网络代理体验，致力于极简的交互与稳定的转发。",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN" className="dark" suppressHydrationWarning>
            <body className={`${inter.className} bg-slate-950 text-slate-50 antialiased`}>
                {children}
            </body>
        </html>
    );
}

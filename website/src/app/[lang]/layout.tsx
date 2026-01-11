import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { i18n } from "../../i18n-config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Tunnet - 为现代互联网而生的幽雅代理工具",
    description: "基于 Tauri 与 sing-box，提供跨平台的高性能网络代理体验，致力于极简的交互与稳定的转发。",
};

export async function generateStaticParams() {
    return i18n.locales.map((locale) => ({ lang: locale }));
}

export default async function RootLayout(props: {
    children: React.ReactNode;
    params: Promise<{ lang: string }>;
}) {
    const params = await props.params;
    const { children } = props;

    return (
        <html lang={params.lang} className="dark" suppressHydrationWarning>
            <body className={`${inter.className} bg-slate-950 text-slate-50 antialiased`} suppressHydrationWarning>
                {children}
            </body>
        </html>
    );
}

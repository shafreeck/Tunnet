"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { i18n } from "../../i18n-config";

export function LocaleSwitcher() {
    const pathName = usePathname();
    const redirectedPathName = (locale: string) => {
        if (!pathName) return "/";
        const segments = pathName.split("/");
        segments[1] = locale;
        return segments.join("/");
    };

    return (
        <div className="flex gap-2 text-sm font-medium">
            {i18n.locales.map((locale) => {
                const isActive = pathName?.startsWith(`/${locale}`);
                return (
                    <Link
                        key={locale}
                        href={redirectedPathName(locale)}
                        className={`transition-colors ${isActive ? "text-white font-bold" : "text-slate-400 hover:text-white"
                            }`}
                    >
                        {locale === "zh" ? "中" : "En"}
                    </Link>
                );
            })}
        </div>
    );
}

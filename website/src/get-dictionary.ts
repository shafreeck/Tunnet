import "server-only";
import type { Locale } from "./i18n-config";

// We enumerate all dictionaries here for better tree-shaking and type safety
const dictionaries = {
    en: () => import("./dictionaries/en.json").then((module) => module.default),
    zh: () => import("./dictionaries/zh.json").then((module) => module.default),
};

export const getDictionary = async (locale: Locale) =>
    dictionaries[locale]?.() ?? dictionaries.zh();

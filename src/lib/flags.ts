// Comprehensive map of country names/codes (English & Chinese)
const COUNTRY_MAP: Record<string, string> = {
    // Common & Major
    "united states": "us", "usa": "us", "america": "us", "美国": "us", "美": "us",
    "united kingdom": "gb", "uk": "gb", "britain": "gb", "great britain": "gb", "英国": "gb", "英": "gb",
    "china": "cn", "中国": "cn", "中": "cn",
    "hong kong": "hk", "hongkong": "hk", "香港": "hk", "港": "hk",
    "taiwan": "tw", "台湾": "tw", "台": "tw",
    "japan": "jp", "日本": "jp", "日": "jp",
    "singapore": "sg", "新加坡": "sg", "新": "sg", "狮城": "sg",
    "korea": "kr", "south korea": "kr", "republic of korea": "kr", "韩国": "kr", "韩": "kr",
    "germany": "de", "deutschland": "de", "德国": "de", "德": "de",
    "france": "fr", "法国": "fr", "法": "fr",
    "canada": "ca", "加拿大": "ca", "加": "ca",
    "australia": "au", "澳大利亚": "au", "澳洲": "au", "奥": "au",
    "russia": "ru", "russian federation": "ru", "俄罗斯": "ru", "俄": "ru",
    "india": "in", "印度": "in", "印": "in",
    "netherlands": "nl", "holland": "nl", "荷兰": "nl", "荷": "nl",
    "turkey": "tr", "turkiye": "tr", "土耳其": "tr", "土": "tr",
    "vietnam": "vn", "viet nam": "vn", "越南": "vn", "越": "vn",
    "thailand": "th", "泰国": "th", "泰": "th",
    "malaysia": "my", "马来西亚": "my", "马": "my",
    "philippines": "ph", "菲律宾": "ph", "菲": "ph",
    "indonesia": "id", "印尼": "id",
    "ukraine": "ua", "乌克兰": "ua",
    "italy": "it", "意大利": "it", "意": "it",
    "spain": "es", "西班牙": "es", "西": "es",
    "brazil": "br", "巴西": "br",
    "argentina": "ar", "阿根廷": "ar",
    "switzerland": "ch", "瑞士": "ch",
    "sweden": "se", "瑞典": "se",
    "norway": "no", "挪威": "no",
    "finland": "fi", "芬兰": "fi",
    "denmark": "dk", "丹麦": "dk",
    "poland": "pl", "波兰": "pl",
    "austria": "at", "奥地利": "at",
    "belgium": "be", "比利时": "be",
    "ireland": "ie", "爱尔兰": "ie",
    "czech republic": "cz", "czechia": "cz", "捷克": "cz",
    "hungary": "hu", "匈牙利": "hu",
    "romania": "ro", "罗马尼亚": "ro",
    "bulgaria": "bg", "保加利亚": "bg",
    "greece": "gr", "希腊": "gr",
    "israel": "il", "以色列": "il",
    "uae": "ae", "united arab emirates": "ae", "阿联酋": "ae",
    "saudi arabia": "sa", "沙特": "sa", "沙特阿拉伯": "sa",
    "south africa": "za", "南非": "za",
    "egypt": "eg", "埃及": "eg",
    "nigeria": "ng", "尼日利亚": "ng",
    "mexico": "mx", "墨西哥": "mx",
    "chile": "cl", "智利": "cl",
    "colombia": "co", "哥伦比亚": "co",
    "peru": "pe", "秘鲁": "pe",
    "new zealand": "nz", "新西兰": "nz",
    "pakistan": "pk", "巴基斯坦": "pk",
    "bangladesh": "bd", "孟加拉": "bd",
    "iran": "ir", "伊朗": "ir",
    "iraq": "iq", "伊拉克": "iq",
    "kazakhstan": "kz", "哈萨克斯坦": "kz",
    "uzbekistan": "uz", "乌兹别克斯坦": "uz",
    "kyrgyzstan": "kg", "吉尔吉斯斯坦": "kg",
    "iceland": "is", "冰岛": "is",
    "estonia": "ee", "爱沙尼亚": "ee",
    "latvia": "lv", "拉脱维亚": "lv",
    "lithuania": "lt", "立陶宛": "lt",
    "moldova": "md", "摩尔多瓦": "md",
    "serbia": "rs", "塞尔维亚": "rs",
    "croatia": "hr", "克罗地亚": "hr",
    "slovakia": "sk", "斯洛伐克": "sk",
    "slovenia": "si", "斯洛文尼亚": "si",
    "portugal": "pt", "葡萄牙": "pt",
    "luxembourg": "lu", "卢森堡": "lu",
    "cyprus": "cy", "塞浦路斯": "cy",
    "malta": "mt", "马耳他": "mt",
}

// Helper for safer matching of short codes
const matchCode = (text: string, code: string): boolean => {
    // Match only if surrounded by non-alphabetic chars or start/end of string
    const regex = new RegExp(`(?:^|[^a-zA-Z])${code}(?:[^a-zA-Z]|$)`, 'i')
    return regex.test(text)
}

export const getCountryCode = (nodeName: string): string => {
    const lower = nodeName.toLowerCase()

    // 0. Optimization: If input is exactly 2 chars, assume it is a code
    if (lower.length === 2 && /^[a-z]+$/.test(lower)) {
        return lower
    }

    // 1. Check strict mapping
    for (const [name, code] of Object.entries(COUNTRY_MAP)) {
        // Chinese characters (any length) - handles "瑞士", "智利", "美国" etc.
        if (/[\u4e00-\u9fa5]/.test(name)) {
            if (lower.includes(name)) return code
        }
        // English names (length > 2 to avoid false positives)
        else if (name.length > 2) {
            if (lower.includes(name)) return code
        }
    }

    // 2. Fallback to manual/regex checks for common short codes
    if (matchCode(nodeName, "hk")) return "hk"
    if (matchCode(nodeName, "tw")) return "tw"
    if (matchCode(nodeName, "jp")) return "jp"
    if (matchCode(nodeName, "kr")) return "kr"
    if (matchCode(nodeName, "sg")) return "sg"
    if (matchCode(nodeName, "us")) return "us"
    if (matchCode(nodeName, "uk") || matchCode(nodeName, "gb")) return "gb"
    if (matchCode(nodeName, "de")) return "de"
    if (matchCode(nodeName, "fr")) return "fr"
    if (matchCode(nodeName, "ca")) return "ca"
    if (matchCode(nodeName, "au")) return "au"
    if (matchCode(nodeName, "in")) return "in"
    if (matchCode(nodeName, "ru")) return "ru"
    if (matchCode(nodeName, "nl")) return "nl"
    if (matchCode(nodeName, "tr")) return "tr"
    if (matchCode(nodeName, "vn")) return "vn"
    if (matchCode(nodeName, "th")) return "th"
    if (matchCode(nodeName, "br")) return "br"
    if (matchCode(nodeName, "ar")) return "ar"
    if (matchCode(nodeName, "my")) return "my"
    if (matchCode(nodeName, "id")) return "id"
    if (matchCode(nodeName, "ph")) return "ph"
    if (matchCode(nodeName, "it")) return "it"
    if (matchCode(nodeName, "es")) return "es"

    return "un"
}

export const getFlagUrlFromCode = (code: string): string => {
    const lower = code.toLowerCase()
    if (lower === "un" || !lower) return ""
    // Return local path; consumer must handle 404 fallback
    return `/flags/${lower}.png`
}

export const getCdnFlagUrl = (code: string): string => {
    const lower = code.toLowerCase()
    // Using jsdelivr for better CDN performance in CN
    return `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@latest/flags/${lower}.svg`
}

export const getFlagUrl = (nodeName: string): string => {
    const code = getCountryCode(nodeName)
    return getFlagUrlFromCode(code)
}

export const getCountryName = (nodeName: string, locale: string = 'en'): string => {
    const code = getCountryCode(nodeName)
    try {
        if (code && code !== 'un') {
            const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
            return regionNames.of(code.toUpperCase()) || nodeName
        }
    } catch (e) {
        // Fallback or old browser support
    }
    return nodeName || "Unknown Location"
}

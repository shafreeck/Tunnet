const PREMIUM_FLAGS = ["us", "hk", "jp", "tw", "sg", "de", "kr", "gb", "fr", "ca", "au", "ru", "nl", "tr", "vn", "th"]

export const getFlagUrlFromCode = (code: string): string => {
    const lower = code.toLowerCase()
    if (lower === "un") return ""
    if (PREMIUM_FLAGS.includes(lower)) {
        return `/flags/${lower}.png`
    }
    // using jsdelivr for better CDN performance in CN
    return `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@latest/flags/${lower}.svg`
}

export const getCountryCode = (nodeName: string): string => {
    const lower = nodeName.toLowerCase()

    // Simple keyword matching for common VPN locations
    if (lower.includes("hong kong") || lower.includes("hk") || lower.includes("香")) return "hk"
    if (lower.includes("taiwan") || lower.includes("tw") || lower.includes("台")) return "tw"
    if (lower.includes("japan") || lower.includes("jp") || lower.includes("日")) return "jp"
    if (lower.includes("korea") || lower.includes("kr") || lower.includes("韩")) return "kr"
    if (lower.includes("singapore") || lower.includes("sg") || lower.includes("新")) return "sg"
    if (lower.includes("united states") || lower.includes("usa") || lower.includes("us") || lower.includes("美")) return "us"
    if (lower.includes("united kingdom") || lower.includes("uk") || lower.includes("britain") || lower.includes("英")) return "gb"
    if (lower.includes("germany") || lower.includes("de") || lower.includes("德")) return "de"
    if (lower.includes("france") || lower.includes("fr") || lower.includes("法")) return "fr"
    if (lower.includes("canada") || lower.includes("ca") || lower.includes("加")) return "ca"
    if (lower.includes("australia") || lower.includes("au") || lower.includes("奥")) return "au"
    if (lower.includes("india") || lower.includes("in") || lower.includes("印")) return "in"
    if (lower.includes("russia") || lower.includes("ru") || lower.includes("俄")) return "ru"
    if (lower.includes("netherlands") || lower.includes("nl") || lower.includes("荷")) return "nl"
    if (lower.includes("turkey") || lower.includes("tr") || lower.includes("土")) return "tr"
    if (lower.includes("vietnam") || lower.includes("vn") || lower.includes("越")) return "vn"
    if (lower.includes("thailand") || lower.includes("th") || lower.includes("泰")) return "th"

    return "un"
}

export const getFlagUrl = (nodeName: string): string => {
    const code = getCountryCode(nodeName)
    return getFlagUrlFromCode(code)
}

export const getCountryName = (nodeName: string): string => {
    const lower = nodeName.toLowerCase()
    if (lower.includes("hong kong") || lower.includes("hk") || lower.includes("香")) return "Hong Kong"
    if (lower.includes("taiwan") || lower.includes("tw") || lower.includes("台")) return "Taiwan"
    if (lower.includes("japan") || lower.includes("jp") || lower.includes("日")) return "Japan"
    if (lower.includes("korea") || lower.includes("kr") || lower.includes("韩")) return "Korea"
    if (lower.includes("singapore") || lower.includes("sg") || lower.includes("新")) return "Singapore"
    if (lower.includes("united states") || lower.includes("usa") || lower.includes("us") || lower.includes("美")) return "United States"
    if (lower.includes("united kingdom") || lower.includes("uk") || lower.includes("britain") || lower.includes("英")) return "United Kingdom"
    if (lower.includes("germany") || lower.includes("de") || lower.includes("德")) return "Germany"
    if (lower.includes("france") || lower.includes("fr") || lower.includes("法")) return "France"
    if (lower.includes("canada") || lower.includes("ca") || lower.includes("加")) return "Canada"
    if (lower.includes("australia") || lower.includes("au") || lower.includes("奥")) return "Australia"
    if (lower.includes("india") || lower.includes("in") || lower.includes("印")) return "India"
    if (lower.includes("russia") || lower.includes("ru") || lower.includes("俄")) return "Russia"
    if (lower.includes("netherlands") || lower.includes("nl") || lower.includes("荷")) return "Netherlands"
    if (lower.includes("turkey") || lower.includes("tr") || lower.includes("土")) return "Turkey"
    if (lower.includes("vietnam") || lower.includes("vn") || lower.includes("越")) return "Vietnam"
    if (lower.includes("thailand") || lower.includes("th") || lower.includes("泰")) return "Thailand"
    return "Unknown Location"
}

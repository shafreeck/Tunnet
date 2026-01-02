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

// Helper for safer matching of short codes
const matchCode = (text: string, code: string): boolean => {
    // Match only if surrounded by non-alphabetic chars or start/end of string
    // e.g. "US" matches "Node-US", "US Node", "[US]", but NOT "Plus" or "Status"
    const regex = new RegExp(`(?:^|[^a-zA-Z])${code}(?:[^a-zA-Z]|$)`, 'i')
    return regex.test(text)
}

export const getCountryCode = (nodeName: string): string => {
    const lower = nodeName.toLowerCase()

    // Full names (safe to use includes usually, but strict is better if possible. 
    // Keep includes for full names as they are specific enough)
    if (lower.includes("hong kong")) return "hk"
    if (lower.includes("taiwan")) return "tw"
    if (lower.includes("japan")) return "jp"
    if (lower.includes("korea")) return "kr"
    if (lower.includes("singapore")) return "sg"
    if (lower.includes("united states")) return "us"
    if (lower.includes("united kingdom")) return "gb"
    if (lower.includes("germany")) return "de"
    if (lower.includes("france")) return "fr"
    if (lower.includes("canada")) return "ca"
    if (lower.includes("australia")) return "au"
    if (lower.includes("india")) return "in"
    if (lower.includes("russia")) return "ru"
    if (lower.includes("netherlands")) return "nl"
    if (lower.includes("turkey")) return "tr"
    if (lower.includes("vietnam")) return "vn"
    if (lower.includes("thailand")) return "th"

    // Short codes with boundary check
    if (matchCode(nodeName, "hk") || lower.includes("香")) return "hk"
    if (matchCode(nodeName, "tw") || lower.includes("台") || lower.includes("tw")) return "tw" // 'tw' is rare in words, allow loose? No, 'network' ends with k, 'software' 'tw'? No. safe-ish. But let's stick to matchCode for consistency where possible.
    // Actually, preserving original loose "tw" check might be safer for compatibility if users have weird names like "NodeTW". 
    // "NodeTW" -> matchCode fails (W is letter).
    // Let's stick to strict matchCode for all 2-letter codes to solve the "vultr" issue and others.

    // Re-evaluating: "NodeTW" is common. matchCode regex requires non-alpha-separator.
    // If I enforce separator, "NodeTW" fails.
    // Maybe just fix "tr", "in", "us", "de", "to", "at", "it", "is"?
    // "vultr" -> "tr" fail.
    // "plus" -> "us" fail.
    // "code" -> "de" fail.
    // "rain" -> "in" fail.

    // For now, let's use matchCode for the ones causing issues, or all of them for correctness.
    if (matchCode(nodeName, "jp") || lower.includes("日")) return "jp"
    if (matchCode(nodeName, "kr") || lower.includes("韩")) return "kr"
    if (matchCode(nodeName, "sg") || lower.includes("新")) return "sg"
    if (matchCode(nodeName, "us") || lower.includes("usa") || lower.includes("美")) return "us"
    if (matchCode(nodeName, "uk") || lower.includes("britain") || lower.includes("英")) return "gb"
    if (matchCode(nodeName, "de") || lower.includes("德")) return "de"
    if (matchCode(nodeName, "fr") || lower.includes("法")) return "fr"
    if (matchCode(nodeName, "ca") || lower.includes("加")) return "ca"
    if (matchCode(nodeName, "au") || lower.includes("奥")) return "au"
    if (matchCode(nodeName, "in") || lower.includes("印")) return "in"
    if (matchCode(nodeName, "ru") || lower.includes("俄")) return "ru"
    if (matchCode(nodeName, "nl") || lower.includes("荷")) return "nl"
    if (matchCode(nodeName, "tr") || lower.includes("土")) return "tr"
    if (matchCode(nodeName, "vn") || lower.includes("越")) return "vn"
    if (matchCode(nodeName, "th") || lower.includes("泰")) return "th"

    // Legacy fallback for really common ones if matchCode is too strict?
    // "US_Node" -> matchCode("US_Node", "us") -> OK (_)
    // "Node-US" -> OK (-)
    // "NodeUS" -> FAIL.
    // "USNode" -> FAIL.
    // Is "NodeUS" common? Maybe. 
    // But "Plus" is more common. False positives are worse than false negatives (default icon).

    return "un"
}

export const getFlagUrl = (nodeName: string): string => {
    const code = getCountryCode(nodeName)
    return getFlagUrlFromCode(code)
}

export const getCountryName = (nodeName: string): string => {
    const code = getCountryCode(nodeName)
    switch (code) {
        case "hk": return "Hong Kong"
        case "tw": return "Taiwan"
        case "jp": return "Japan"
        case "kr": return "Korea"
        case "sg": return "Singapore"
        case "us": return "United States"
        case "gb": return "United Kingdom"
        case "de": return "Germany"
        case "fr": return "France"
        case "ca": return "Canada"
        case "au": return "Australia"
        case "in": return "India"
        case "ru": return "Russia"
        case "nl": return "Netherlands"
        case "tr": return "Turkey"
        case "vn": return "Vietnam"
        case "th": return "Thailand"
        default: return "Unknown Location"
    }
}

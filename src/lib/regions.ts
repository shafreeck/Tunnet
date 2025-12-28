
// Map of ISO 3166-1 alpha-2 country codes (or names) to Regions
export const REGION_MAPPING: Record<string, string> = {
    // Asia Pacific
    "CN": "Asia Pacific", "HK": "Asia Pacific", "TW": "Asia Pacific",
    "JP": "Asia Pacific", "KR": "Asia Pacific", "SG": "Asia Pacific",
    "IN": "Asia Pacific", "AU": "Asia Pacific", "NZ": "Asia Pacific",
    "VN": "Asia Pacific", "TH": "Asia Pacific", "MY": "Asia Pacific",
    "ID": "Asia Pacific", "PH": "Asia Pacific",
    "Hong Kong": "Asia Pacific", "Taiwan": "Asia Pacific", "Japan": "Asia Pacific",
    "South Korea": "Asia Pacific", "United States": "Americas",
    // Americas
    "US": "Americas", "CA": "Americas", "MX": "Americas",
    "BR": "Americas", "AR": "Americas", "CL": "Americas",
    // Europe
    "GB": "Europe", "DE": "Europe", "FR": "Europe", "NL": "Europe",
    "IT": "Europe", "ES": "Europe", "RU": "Europe", "CH": "Europe",
    "SE": "Europe", "NO": "Europe", "FI": "Europe", "DK": "Europe",
    "United Kingdom": "Europe", "Germany": "Europe", "France": "Europe",

    // Middle East / Others
    "TR": "Europe", "AE": "Asia Pacific", "IL": "Asia Pacific"
}

export function getRegionForCountry(countryCodeOrName: string): string {
    const region = REGION_MAPPING[countryCodeOrName] || REGION_MAPPING[countryCodeOrName.toUpperCase()];
    return region || "Other";
}

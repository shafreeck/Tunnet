
// Mapping of ISO 3166-1 alpha-2 country codes to [longitude, latitude]
// Used for placing markers on the world map.

export const COUNTRY_COORDINATES: Record<string, [number, number]> = {
    // Asia
    "HK": [114.1694, 22.3193], // Hong Kong
    "JP": [138.2529, 36.2048], // Japan
    "SG": [103.8198, 1.3521],  // Singapore
    "KR": [127.7669, 35.9078], // South Korea
    "TW": [120.9605, 23.6978], // Taiwan
    "IN": [78.9629, 20.5937],  // India
    "TH": [100.9925, 15.8700], // Thailand
    "MY": [101.9758, 4.2105],  // Malaysia
    "ID": [113.9213, -0.7893], // Indonesia
    "VN": [108.2772, 14.0583], // Vietnam
    "PH": [121.7740, 12.8797], // Philippines

    // North America
    "US": [-95.7129, 37.0902], // USA
    "CA": [-106.3468, 56.1304], // Canada
    "MX": [-102.5528, 23.6345], // Mexico

    // Europe
    "GB": [-3.4359, 55.3781],  // United Kingdom
    "UK": [-3.4359, 55.3781],  // UK (Alias)
    "DE": [10.4515, 51.1657],  // Germany
    "FR": [2.2137, 46.2276],   // France
    "NL": [5.2913, 52.1326],   // Netherlands
    "RU": [105.3188, 61.5240], // Russia
    "IT": [12.5674, 41.8719],  // Italy
    "ES": [-3.7492, 40.4637],  // Spain
    "CH": [8.2275, 46.8182],   // Switzerland
    "SE": [18.6435, 60.1282],  // Sweden
    "NO": [8.4689, 60.4720],   // Norway
    "IE": [-8.2439, 53.4129],  // Ireland
    "TR": [35.2433, 38.9637],  // Turkey
    "UA": [31.1656, 48.3794],  // Ukraine

    // Oceania
    "AU": [133.7751, -25.2744], // Australia
    "NZ": [174.8860, -40.9006], // New Zealand

    // South America
    "BR": [-51.9253, -14.2350], // Brazil
    "AR": [-63.6167, -38.4161], // Argentina
    "CL": [-71.5430, -35.6751], // Chile

    // Africa
    "ZA": [22.9375, -30.5595], // South Africa
    "EG": [30.8025, 26.8206],  // Egypt
};

export const getCountryCoordinates = (code: string): [number, number] | null => {
    const upper = code.toUpperCase();
    return COUNTRY_COORDINATES[upper] || null;
};

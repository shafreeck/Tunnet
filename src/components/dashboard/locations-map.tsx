"use client"

import React, { useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
// @ts-ignore
import { X, RefreshCw, Target } from "lucide-react"
import { getCountryCoordinates } from "@/lib/country-coords"
import { useTranslation } from "react-i18next"
import { getCountryName } from "@/lib/flags"

// URL to a valid TopoJSON file
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

// Mapping from our display name to the map's property name
// Mapping from ISO Code / Display Name to the map's property name
const NAME_MAPPING: Record<string, string> = {
    // ISO Codes
    "US": "United States of America",
    "GB": "United Kingdom",
    "UK": "United Kingdom",
    "KR": "South Korea",
    "JP": "Japan",
    "CN": "China",
    "TW": "Taiwan",
    "HK": "Hong Kong",
    "DE": "Germany",
    "FR": "France",
    "SG": "Singapore",
    "NL": "Netherlands",
    "CA": "Canada",
    "AU": "Australian", // Typo in some maps, check 'Australia'
    "AU_FIX": "Australia",
    "IN": "India",
    "RU": "Russia",
    "BR": "Brazil",
    "IE": "Ireland",
    "SE": "Sweden",
    "NO": "Norway",
    "FI": "Finland",
    "CH": "Switzerland",
    "IT": "Italy",
    "ES": "Spain",
    "TR": "Turkey",
    "IL": "Israel",
    "AE": "United Arab Emirates",
    "ZA": "South Africa",

    // Explicit Names (Legacy)
    "United States": "United States of America",
    "Korea": "South Korea",
    "United Kingdom": "United Kingdom",
    "Russia": "Russia",
    "Hong Kong": "Hong Kong",
    "Taiwan": "Taiwan"
}

// Reverse mapping for click handling (Map Name -> Display Name)
// Reverse mapping for click handling (Map Name -> Display Name)
// We need to be careful here because multiple keys map to the same value (e.g. US -> USA, United States -> USA)
// We want to prefer the "Display Name" version if available, or just use the code.
// Actually, since our backend now returns CODES (US), we might want to map BACK to Code?
// But the UI (list view) might expect Codes now.
// However, existing logic might rely on "United States".
// Let's create a map that prioritizes the "Code" if it looks like a code (length 2), OR the explicit legacy name.
// Actually, simpler: Let's trust that `servers` use ISO codes now usually.
const REVERSE_NAME_MAPPING: Record<string, string> = {}
Object.entries(NAME_MAPPING).forEach(([k, v]) => {
    // If the value is already set, we only overwrite if the new key `k` is "better"
    // For now, let's just ensure we have *some* mapping.
    // If we have "United States" and "US", both map to "United States of America".
    // We probably want the click to return "US" if that's what the server has.
    // But we don't know what the server has here strictly.
    // Strategy: Just use the Last one encountered? Or build a list?
    // Let's just use the Key as the source.
    if (!REVERSE_NAME_MAPPING[v]) {
        REVERSE_NAME_MAPPING[v] = k
    } else {
        // If we already have a mapping, prefer the one that matches length 2 (ISO) 
        // IF the current one is longer, OR prefer the longer one?
        // Let's stick to the ISO code if available, as that's what we want to standardize on.
        if (k.length === 2) {
            REVERSE_NAME_MAPPING[v] = k
        }
    }
})

interface LocationsMapProps {
    servers: any[]
    activeServerId: string | null
    selectedCountryCode: string | null
    onSelectCountry: (countryCode: string | null) => void
    onSelectServer: (id: string) => void
    onToggleServer: (id: string) => void
}

export function LocationsMap({
    servers,
    activeServerId,
    selectedCountryCode,
    onSelectCountry,
    onSelectServer,
    onToggleServer
}: LocationsMapProps) {
    const { i18n } = useTranslation()
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

    // Get unique countries from servers to highlight them
    const activeCountries = useMemo(() => {
        const groups: Record<string, number> = {}
        servers.forEach(s => {
            if (s.countryCode && s.countryCode !== 'un') {
                const codeUpper = s.countryCode.toUpperCase()
                // Use code to resolve map name (e.g. JP -> Japan)
                // Fallback to s.country only if mapping not found (might fail if localized)
                const mapName = NAME_MAPPING[codeUpper] || s.country
                if (mapName) {
                    groups[mapName] = (groups[mapName] || 0) + 1
                }
            }
        })
        return groups
    }, [servers])

    const { resolvedTheme } = useTheme()
    const isDark = resolvedTheme === 'dark'

    // Theme Colors
    const mapFill = isDark ? "#18181b" : "#ffffff"
    const mapStroke = isDark ? "#27272a" : "#d4d4d8"
    const nodeDisconnected = isDark ? "#52525b" : "#a1a1aa"
    const nodeStroke = isDark ? "#27272a" : "#ffffff"

    // Filter servers for markers if a country is selected
    const filteredServers = useMemo(() => {
        if (!selectedCountryCode) return servers
        return servers.filter(s => s.countryCode === selectedCountryCode)
    }, [servers, selectedCountryCode])

    return (
        <div className="flex-1 flex flex-col relative w-full h-full overflow-hidden bg-white/0 rounded-xl">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                {/* Map specific controls could go here if needed, but main controls are in parent */}
            </div>

            <ComposableMap
                projection="geoMercator"
                projectionConfig={{
                    scale: 120,
                    center: [0, 20]
                }}
                className="w-full h-full"
            >
                <ZoomableGroup maxZoom={4} minZoom={1}>
                    <Geographies geography={GEO_URL}>
                        {({ geographies }) =>
                            geographies.map((geo) => {
                                const countryName = geo.properties.name
                                const hasServers = activeCountries[countryName]

                                // Resolve selected code to map name
                                const mapNameFromCode = selectedCountryCode ? NAME_MAPPING[selectedCountryCode.toUpperCase()] : null
                                const isSelected = mapNameFromCode === countryName

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        onClick={() => {
                                            if (hasServers) {
                                                // Convert Map Name back to Code
                                                const internalCode = REVERSE_NAME_MAPPING[countryName] || "un"
                                                // Check both directions for toggle logic
                                                const currentlySelected = selectedCountryCode === internalCode
                                                onSelectCountry(currentlySelected ? null : internalCode)
                                            }
                                        }}
                                        onMouseEnter={(e) => {
                                            const count = activeCountries[countryName] || 0
                                            const localizedName = getCountryName(REVERSE_NAME_MAPPING[countryName] || countryName, i18n.language)
                                            setTooltip({
                                                content: count > 0 ? `${localizedName} • ${count} Nodes` : localizedName,
                                                x: e.clientX,
                                                y: e.clientY
                                            })
                                        }}
                                        onMouseLeave={() => setTooltip(null)}
                                        onMouseMove={(e) => {
                                            setTooltip(prev => prev ? ({ ...prev, x: e.clientX, y: e.clientY }) : null)
                                        }}
                                        style={{
                                            default: {
                                                fill: hasServers ? (isSelected ? "#22c55e" : "#22c55e20") : mapFill,
                                                stroke: hasServers ? "#22c55e40" : mapStroke,
                                                strokeWidth: 0.5,
                                                outline: "none",
                                                cursor: hasServers ? "pointer" : "default"
                                            },
                                            hover: {
                                                fill: hasServers ? "#22c55e" : mapStroke,
                                                stroke: mapStroke,
                                                strokeWidth: 0.5,
                                                outline: "none",
                                                cursor: hasServers ? "pointer" : "default"
                                            },
                                            pressed: {
                                                fill: hasServers ? "#16a34a" : mapFill,
                                                outline: "none"
                                            }
                                        }}
                                    />
                                )
                            })
                        }
                    </Geographies>
                    {/* Sort servers: render verified (lat/lon) markers after country-center markers so they are on top */}
                    {[...filteredServers].sort((a, b) => {
                        const aV = (a.location?.lat && a.location?.lon) ? 1 : 0
                        const bV = (b.location?.lat && b.location?.lon) ? 1 : 0
                        return aV - bV
                    }).map((server) => {
                        const isSelected = server.id === activeServerId
                        let coords: [number, number] | null = null
                        const isVerified = (server.location && typeof server.location.lat === 'number' && typeof server.location.lon === 'number');
                        const hasLatency = server.ping && server.ping > 0;

                        if (isVerified) {
                            coords = [server.location.lon, server.location.lat]
                        } else if (server.countryCode) {
                            coords = getCountryCoordinates(server.countryCode)
                        }

                        if (coords) {
                            return (
                                <Marker
                                    key={server.id}
                                    coordinates={coords}
                                    onClick={() => onSelectServer(server.id)}
                                    // ... handlers
                                    onMouseEnter={(e) => {
                                        const locationStr = server.location?.city || getCountryName(server.location?.country || server.country, i18n.language) || "Unknown Location"
                                        setTooltip({
                                            content: `${server.name} • ${locationStr} • ${server.ping ? server.ping + " ms" : "N/A"}`,
                                            x: e.clientX,
                                            y: e.clientY
                                        })
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                >
                                    <g
                                        className="cursor-pointer transition-all duration-300"
                                        onMouseMove={(e) => {
                                            setTooltip(prev => prev ? ({ ...prev, x: e.clientX, y: e.clientY }) : null)
                                        }}
                                    >
                                        {/* Glow effect for Active Server */}
                                        {isSelected && (
                                            <circle r={12} fill="#22c55e20" className="animate-pulse" />
                                        )}

                                        {/* Diffusing Glow effect (Ping) - Only for verified or selected */}
                                        {(isVerified || isSelected) && (
                                            <circle r={isSelected ? 10 : 6} fill={isSelected ? "#22c55e" : "#22c55e"} className="animate-ping opacity-75" style={{ animationDuration: '2s' }} />
                                        )}

                                        {/* Core marker */}
                                        <circle
                                            r={isSelected ? 6 : (isVerified ? 5 : 4)}
                                            fill={isSelected ? "#22c55e" : ((isVerified || hasLatency) ? "#22c55e" : nodeDisconnected)}
                                            stroke={isSelected ? "#fff" : (isVerified ? "#000" : nodeStroke)}
                                            strokeWidth={isSelected ? 2 : 1}
                                            style={{ opacity: (isVerified || isSelected || hasLatency) ? 1 : 0.8 }}
                                        />

                                        {/* ... rest */}

                                        {/* Active Target Indicator */}
                                        {isSelected && (
                                            <g transform="translate(-4, -4) scale(0.5)">
                                                <Target size={16} className="text-white" />
                                            </g>
                                        )}
                                    </g>
                                </Marker>
                            )
                        }
                        return null
                    })}
                </ZoomableGroup>
            </ComposableMap>

            {/* Custom Tooltip */}
            {tooltip && typeof document !== 'undefined' && createPortal(
                <div
                    className={cn(
                        "fixed z-[9999] px-3 py-1.5 bg-zinc-900/90 backdrop-blur-md border border-white/10 text-xs text-white rounded-lg shadow-xl pointer-events-none whitespace-nowrap transition-[transform,opacity] duration-75",
                    )}
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: `translate(${tooltip.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 500)
                            ? "calc(-100% - 20px)"
                            : "20px"
                            }, ${tooltip.y > (typeof window !== 'undefined' ? window.innerHeight / 2 : 400)
                                ? "calc(-100% - 20px)"
                                : "20px"
                            })`
                    }}
                >
                    {tooltip.content}
                </div>,
                document.body
            )}

            <div className="absolute bottom-4 left-4 text-[10px] text-gray-500">
                Scroll to zoom • Drag to pan
            </div>
        </div>
    )
}

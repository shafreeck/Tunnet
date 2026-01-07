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
const NAME_MAPPING: Record<string, string> = {
    "United States": "United States of America",
    "Korea": "South Korea",
    "United Kingdom": "United Kingdom",
    "Russia": "Russia",
    "Hong Kong": "Hong Kong",
    "Taiwan": "Taiwan"
}

// Reverse mapping for click handling (Map Name -> Display Name)
const REVERSE_NAME_MAPPING: Record<string, string> = Object.entries(NAME_MAPPING).reduce((acc, [k, v]) => {
    acc[v] = k
    return acc
}, {} as Record<string, string>)

interface LocationsMapProps {
    servers: any[]
    activeServerId: string | null
    selectedCountry: string | null
    onSelectCountry: (country: string | null) => void
    onSelectServer: (id: string) => void
    onToggleServer: (id: string) => void
}

export function LocationsMap({
    servers,
    activeServerId,
    selectedCountry,
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
            if (s.country) {
                const mapName = NAME_MAPPING[s.country] || s.country
                groups[mapName] = (groups[mapName] || 0) + 1
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

    // Filter servers for markers if a country is selected (optional, or show all markers always?)
    // Current logic: Show markers matching selection if selected, else show all?
    // Actually existing logic showed filtered servers in the list, but markers?
    // Let's look at previous code: `filteredServers` was used for the LIST, but markers iterated `filteredServers` too.
    const filteredServers = useMemo(() => {
        if (!selectedCountry) return servers
        return servers.filter(s => s.country === selectedCountry)
    }, [servers, selectedCountry])

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
                                const isSelected = selectedCountry === countryName || (selectedCountry && NAME_MAPPING[selectedCountry] === countryName)

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        onClick={() => {
                                            if (hasServers) {
                                                // Convert Map Name back to Internal Name if needed
                                                const internalName = REVERSE_NAME_MAPPING[countryName] || countryName
                                                // Check both directions for toggle logic
                                                const currentlySelected = selectedCountry === internalName
                                                onSelectCountry(currentlySelected ? null : internalName)
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
                                                fill: hasServers ? "#22c55e" : mapStroke, // Slightly lighter on hover for empty? Or mapped?
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
                        let isVerified = false

                        if (server.location && typeof server.location.lat === 'number' && typeof server.location.lon === 'number') {
                            coords = [server.location.lon, server.location.lat]
                            isVerified = true
                        } else if (server.countryCode) {
                            coords = getCountryCoordinates(server.countryCode)
                        }

                        if (coords) {
                            return (
                                <Marker
                                    key={server.id}
                                    coordinates={coords}
                                    onClick={() => onSelectServer(server.id)}
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
                                            fill={isSelected ? "#22c55e" : (isVerified ? "#22c55e" : nodeDisconnected)}
                                            stroke={isSelected ? "#fff" : (isVerified ? "#000" : nodeStroke)}
                                            strokeWidth={isSelected ? 2 : 1}
                                            style={{ opacity: (isVerified || isSelected) ? 1 : 0.8 }}
                                        />

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

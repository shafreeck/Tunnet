import React, { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ServerCard } from "./server-card"
import { getRegionForCountry } from "@/lib/regions"
import { cn } from "@/lib/utils"
import { getCountryName } from "@/lib/flags"

interface LocationGridProps {
    servers: any[]
    selectedRegion: string // "All Regions" or specific region
    searchQuery: string
    onSelectCountry: (countryName: string) => void
    onExport?: (countryCode: string, countryName: string) => void
}

export function LocationGrid({ servers, selectedRegion, searchQuery, onSelectCountry, onExport }: LocationGridProps) {
    const { t, i18n } = useTranslation()

    // 1. Group servers by Country Code (aggregated view)
    const countries = useMemo(() => {
        const map = new Map<string, {
            countryCode: string
            countryName: string
            flagUrl: string
            count: number
            avgPing: number
            region: string
            provider: string
        }>()

        servers.forEach(s => {
            // Normalize country name and code
            const countryCode = s.countryCode || "un"
            const countryName = (countryCode && countryCode !== "un")
                ? getCountryName(countryCode, i18n.language)
                : (s.country || t('locations.unknown', { defaultValue: 'Unknown' }))
            const region = getRegionForCountry(countryCode)

            if (!map.has(countryCode)) {
                map.set(countryCode, {
                    countryCode,
                    countryName, // Localized name
                    flagUrl: s.flagUrl,
                    count: 0,
                    avgPing: 0,
                    region,
                    provider: s.provider || t('locations.unknown', { defaultValue: 'Unknown' }),
                })
            }

            const entry = map.get(countryCode)!
            entry.count += 1
            if (s.ping > 0) {
                if (entry.avgPing === 0 || s.ping < entry.avgPing) {
                    entry.avgPing = s.ping
                }
            }
        })

        return Array.from(map.values())
    }, [servers])

    // 2. Filter by Search & Region
    const filteredCountries = useMemo(() => {
        return countries.filter(c => {
            const matchesSearch = c.countryName.toLowerCase().includes(searchQuery.toLowerCase())
            const matchesRegion = selectedRegion === "All Regions"
                ? true
                : c.region === selectedRegion

            return matchesSearch && matchesRegion
        })
    }, [countries, searchQuery, selectedRegion])

    // 3. Group by Region for display
    const groups = useMemo(() => {
        const g: Record<string, typeof filteredCountries> = {}
        const regionOrder = ["Asia Pacific", "Americas", "Europe", "Other"]

        filteredCountries.forEach(c => {
            if (!g[c.region]) g[c.region] = []
            g[c.region].push(c)
        })

        return regionOrder
            .filter(r => g[r] && g[r].length > 0)
            .map(r => ({ name: r, items: g[r] }))

    }, [filteredCountries])

    if (filteredCountries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
                <p>{t('locations.no_locations', { defaultValue: "No locations found matching your criteria." })}</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 p-4 pb-20 overflow-y-auto h-full sidebar-scroll">
            {groups.map((group) => (
                <div key={group.name} className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-accent-blue" />
                        <h2 className="text-xs font-bold text-text-tertiary uppercase tracking-widest">
                            {t(`locations.regions.${group.name.toLowerCase().replace(/ /g, '_')}`, { defaultValue: group.name })}
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                        {group.items.map((country) => (
                            <ServerCard
                                key={country.countryCode}
                                countryName={country.countryName}
                                flagUrl={country.flagUrl}
                                locationCount={country.count}
                                providerName={country.provider}
                                ping={country.avgPing}
                                onClick={() => onSelectCountry(country.countryCode)}
                                onShare={() => onExport?.(country.countryCode, country.countryName)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

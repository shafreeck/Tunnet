import React from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
// @ts-ignore
import { Globe, ChevronRight } from "lucide-react"

interface ServerCardProps {
    countryName: string
    flagUrl: string | null
    locationCount: number
    providerName?: string
    ping?: number
    onClick: () => void
    onClick: () => void
    isHovered?: boolean
    isAutoSelected?: boolean
}

export function ServerCard({
    countryName,
    flagUrl,
    locationCount,
    providerName = "Multiple Providers",
    ping,
    onClick,
    isAutoSelected
}: ServerCardProps) {
    const { t } = useTranslation()
    const displayProviderName = providerName === "Multiple Providers" ? t('locations.card.multiple_providers') : providerName

    const getPingColor = (p?: number) => {
        if (p === undefined || p === 0) return "text-text-tertiary"
        if (p < 100) return "text-emerald-400"
        if (p < 200) return "text-yellow-400"
        return "text-red-400"
    }

    const getLatencyGrade = (p?: number) => {
        if (p === undefined || p === 0) return { key: 'locations.card.grade.unknown', color: 'text-text-tertiary' }
        if (p < 100) return { key: 'locations.card.grade.excellent', color: 'text-emerald-400' }
        if (p < 200) return { key: 'locations.card.grade.good', color: 'text-yellow-400' }
        return { key: 'locations.card.grade.poor', color: 'text-red-400' }
    }

    const grade = getLatencyGrade(ping)

    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative bg-card-bg hover:border-primary/20 border transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm shadow-sm hover:shadow-md rounded-2xl p-5",
                isAutoSelected ? "border-accent-green/50 ring-1 ring-accent-green/20" : "border-border-color"
            )}
        >
            {/* Header: Flag & Ping */}
            <div className="flex justify-between items-start mb-3">
                <div className="relative size-10 rounded-full overflow-hidden shadow-sm border border-border-color bg-black/5 dark:bg-black/20 flex items-center justify-center">
                    {flagUrl ? (
                        <img src={flagUrl} alt={countryName} className="w-full h-full object-cover" />
                    ) : (
                        <Globe className="text-text-tertiary size-5" />
                    )}
                </div>
                {ping !== undefined && ping > 0 && (
                    <div className="flex items-center gap-1.5 bg-black/5 dark:bg-black/40 px-2 py-1 rounded-full border border-border-color">
                        <div className={cn("size-1.5 rounded-full", ping < 100 ? "bg-emerald-500" : ping < 200 ? "bg-yellow-500" : "bg-red-500")} />
                        <span className={cn("text-[10px] font-bold font-mono", getPingColor(ping))}>
                            {ping}ms
                        </span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="space-y-1">
                <h3 className="text-text-primary font-bold text-lg tracking-tight group-hover:text-primary transition-colors flex items-center gap-2">
                    {countryName}
                    {isAutoSelected && (
                        <span className="text-[9px] font-extrabold uppercase bg-accent-green text-black px-1.5 py-0.5 rounded-sm tracking-widest shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse">
                            Auto
                        </span>
                    )}
                </h3>
                <p className="text-xs text-text-secondary font-medium">
                    {t('locations.card.location_count', { count: locationCount })} • {displayProviderName}
                </p>
            </div>

            {/* Footer / Latency Grade */}
            <div className="mt-6 flex items-center justify-between">
                <span className="text-[10px] text-text-tertiary font-medium">
                    {t('locations.card.latency')}: <span className={cn("font-bold", grade.color)}>{t(grade.key)}</span>
                </span>

                <div className="text-text-tertiary group-hover:text-text-primary transition-transform duration-300 group-hover:translate-x-1">
                    <ChevronRight size={16} />
                </div>
            </div>

            {/* Hover Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />
        </div >
    )
}

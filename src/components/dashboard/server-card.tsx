import React from "react"
import { cn } from "@/lib/utils"
// @ts-ignore
import { Globe, ChevronRight } from "lucide-react"

interface ServerCardProps {
    countryName: string
    flagUrl: string | null
    locationCount: number
    providerName?: string
    usagePercent?: number
    ping?: number
    onClick: () => void
    isHovered?: boolean
}

export function ServerCard({
    countryName,
    flagUrl,
    locationCount,
    providerName = "Multiple Providers",
    usagePercent = 0,
    ping,
    onClick
}: ServerCardProps) {
    const getPingColor = (p: number) => {
        if (p < 100) return "text-emerald-400"
        if (p < 200) return "text-yellow-400"
        return "text-red-400"
    }

    return (
        <div
            onClick={onClick}
            className="group relative bg-[#18181b]/60 hover:bg-[#27272a]/60 border border-white/5 hover:border-white/10 rounded-2xl p-5 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm"
        >
            {/* Header: Flag & Ping */}
            <div className="flex justify-between items-start mb-3">
                <div className="relative size-10 rounded-full overflow-hidden shadow-lg border border-white/10 bg-black/20 flex items-center justify-center">
                    {flagUrl ? (
                        <img src={flagUrl} alt={countryName} className="w-full h-full object-cover" />
                    ) : (
                        <Globe className="text-gray-500 size-5" />
                    )}
                </div>
                {ping !== undefined && ping > 0 && (
                    <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full border border-white/5">
                        <div className={cn("size-1.5 rounded-full", ping < 100 ? "bg-emerald-500" : ping < 200 ? "bg-yellow-500" : "bg-red-500")} />
                        <span className={cn("text-[10px] font-bold font-mono", getPingColor(ping))}>
                            {ping}ms
                        </span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="space-y-1">
                <h3 className="text-white font-bold text-lg tracking-tight group-hover:text-accent-green transition-colors">
                    {countryName}
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                    {locationCount} Locations • {providerName}
                </p>
            </div>

            {/* Footer / Usage (Mock) */}
            <div className="mt-6 flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-medium">
                    Usage: {usagePercent > 0 ? `${usagePercent}%` : "Low"}
                </span>

                <div className="text-gray-600 group-hover:text-white transition-transform duration-300 group-hover:translate-x-1">
                    <ChevronRight size={16} />
                </div>
            </div>

            {/* Hover Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />
        </div>
    )
}

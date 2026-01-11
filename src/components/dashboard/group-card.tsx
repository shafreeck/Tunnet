import React, { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Edit2, Trash2, Check, Zap, List, Play, MousePointerClick, Filter, Layers, MoreHorizontal, Target, Server, Activity, ArrowRightLeft, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCountryName } from "@/lib/flags"

export interface Group {
    id: string
    name: string
    group_type: "Selector" | "UrlTest"
    source: {
        type: "Static"
        node_ids?: string[]
    } | {
        type: "Filter"
        criteria: {
            keywords?: string[]
        }
    }
    icon?: string
}

interface GroupCardProps {
    group: Group
    isActive: boolean
    onEdit: (group: Group) => void
    onDelete: (id: string) => void
    onActivate: (id: string) => void
    onSelectNode?: (group: Group) => void
    t: (key: string, options?: any) => string
    nodeCount?: number
    allNodes: any[]
}

export function GroupCard({ group, isActive, onEdit, onDelete, onActivate, onSelectNode, t, nodeCount, allNodes }: GroupCardProps) {
    const { i18n } = useTranslation()
    const isAuto = group.group_type === "UrlTest"
    const isStatic = group.source.type === "Static"

    // Calculate Latency (Min Ping of nodes in group)
    const groupLatency = useMemo(() => {
        let candidates: any[] = []
        if (isStatic) {
            // @ts-ignore
            const ids = new Set(group.source.node_ids || [])
            candidates = allNodes.filter(n => ids.has(n.id))
        } else {
            // @ts-ignore
            const keywords = (group.source.criteria?.keywords || []).map(k => k.toLowerCase())
            if (keywords.length > 0) {
                candidates = allNodes.filter(n => {
                    const name = n.name.toLowerCase()
                    return keywords.some((k: string) => name.includes(k))
                })
            }
        }

        // Filter valid pings
        const pings = candidates.map(n => n.ping).filter(p => p !== undefined && p > 0)
        if (pings.length === 0) return 0
        return Math.min(...pings)
    }, [group, allNodes])

    // Helper for styles (Copied from server-card)
    const getPingColor = (p?: number) => {
        if (p === undefined || p === 0) return "text-text-tertiary"
        if (p < 200) return "text-emerald-400"
        if (p <= 600) return "text-yellow-400"
        return "text-red-400"
    }

    const getLatencyGrade = (p?: number) => {
        if (p === undefined || p === 0) return { key: 'locations.card.grade.unknown', color: 'text-text-tertiary' }
        if (p < 200) return { key: 'locations.card.grade.excellent', color: 'text-emerald-400' }
        if (p <= 600) return { key: 'locations.card.grade.good', color: 'text-yellow-400' }
        return { key: 'locations.card.grade.poor', color: 'text-red-400' }
    }

    const grade = getLatencyGrade(groupLatency)
    const pingColor = getPingColor(groupLatency)

    // Configuration for visuals
    const config = useMemo(() => {
        if (isAuto) {
            return {
                icon: Zap,
                color: "text-blue-500",
                bg: "bg-blue-500/10",
                hoverBg: "group-hover:bg-blue-500/20",
                activeBorder: "border-blue-500/50 ring-1 ring-blue-500/20",
                badge: "bg-blue-500"
            }
        }
        return {
            icon: MousePointerClick,
            color: "text-purple-500",
            bg: "bg-purple-500/10",
            hoverBg: "group-hover:bg-purple-500/20",
            activeBorder: "border-purple-500/50 ring-1 ring-purple-500/20",
            badge: "bg-purple-500"
        }
    }, [isAuto])

    const Icon = config.icon

    // Data extraction
    const nodeCountValue = group.source.type === "Static" ? (group.source.node_ids?.length || 0) : 0
    // Re-calculate node count for Filter groups too if possible, otherwise use keyword text

    // Subtitle logic
    const subtitle = isStatic
        ? `${nodeCountValue} ${t('groups.nodes')} • ${isAuto ? "Auto" : "Selector"}`
        : `${t('groups.filter')} • ${isAuto ? "Auto" : "Selector"}`

    // Localized Name Logic
    const groupNameDisplay = useMemo(() => {
        // Only translate system generated groups
        const isSystemGroup = group.id.startsWith("system:") || group.id.startsWith("auto_")
        if (!isSystemGroup) return group.name

        // Special case for AUTO
        if (group.name === "AUTO") return t('auto_select_prefix') || "Auto"
        if (group.name === "GLOBAL") return t('auto_select_global') || "Global"

        // Handle System Region Groups (name is Country Code)
        if (group.id.startsWith("system:region:") || /^[A-Z]{2}$/.test(group.name)) {
            return getCountryName(group.name, i18n.language)
        }

        return group.name
    }, [group.name, group.id, t, i18n.language])

    return (
        <div
            onClick={() => onActivate(group.id)}
            className={cn(
                "glass-card relative flex flex-col p-5 rounded-3xl transition-all duration-300 group/card cursor-pointer border overflow-hidden",
                isActive
                    ? cn("shadow-lg bg-card-bg", config.activeBorder)
                    : "border-border-color hover:border-primary/30 hover:shadow-md bg-card-bg/50",
                "h-[160px]"
            )}
        >
            {/* Hover Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover/card:opacity-100 -skew-x-12 translate-x-[-100%] group-hover/card:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />

            {/* Header Section */}
            <div className="flex justify-between items-start mb-4 z-10 relative">
                <div className="flex items-center gap-4">
                    {/* Icon Box */}
                    <div className={cn("size-12 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-inner", config.bg, config.color, config.hoverBg)}>
                        <Icon size={24} strokeWidth={2} />
                    </div>

                    {/* Titles */}
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-lg font-bold text-text-primary leading-tight flex items-center gap-2">
                            {groupNameDisplay}
                            {isActive && (
                                <span className={cn("size-2 rounded-full animate-pulse", config.badge)} />
                            )}
                        </h3>
                        <p className="text-xs text-text-secondary font-medium opacity-80">
                            {subtitle}
                        </p>
                    </div>
                </div>

                {/* Right Side: Actions + Ping Badge */}
                <div className="flex flex-col items-end gap-2">
                    {/* Ping Badge */}
                    {groupLatency > 0 && (
                        <div className="flex items-center gap-1.5 bg-black/5 dark:bg-black/40 px-2.5 py-1 rounded-full border border-border-color/50 backdrop-blur-md">
                            <div className={cn("size-1.5 rounded-full", groupLatency < 200 ? "bg-emerald-500" : groupLatency <= 600 ? "bg-yellow-500" : "bg-red-500")} />
                            <span className={cn("text-[10px] font-bold font-mono", pingColor)}>
                                {groupLatency}ms
                            </span>
                        </div>
                    )}

                    {/* Actions - Revealed on Hover */}
                    <div
                        className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-all duration-200 translate-x-4 group-hover/card:translate-x-0"
                        onClick={e => e.stopPropagation()}
                    >
                        {!isAuto && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onSelectNode && onSelectNode(group); }}
                                className="p-2 text-text-tertiary hover:text-primary hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors"
                                title={t('groups.select_active')}
                            >
                                <List size={16} />
                            </button>
                        )}
                        {!group.id.includes(":") && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(group); }}
                                    className="p-2 text-text-tertiary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}
                                    className="p-2 text-text-tertiary hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Metadata Section */}
            <div className="mt-auto flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-4 z-10 relative">
                {/* Left: Latency Grade */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-tertiary font-medium uppercase tracking-wider">
                        {t('locations.card.latency')}:
                    </span>
                    <span className={cn("text-xs font-bold", grade.color)}>
                        {t(grade.key)}
                    </span>
                </div>

                {/* Right: Active Status */}
                {isActive && (
                    <div className="flex items-center gap-1.5 text-emerald-500 px-2 py-0.5 rounded-lg bg-emerald-500/5">
                        <Target size={14} strokeWidth={3} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">{t('groups.active_exit')}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

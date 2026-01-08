import React, { useMemo } from "react"
import { Edit2, Trash2, Check, Zap, List, Play, MousePointerClick, Filter, Layers, MoreHorizontal, Target, Server, Activity, ArrowRightLeft, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

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
}

export function GroupCard({ group, isActive, onEdit, onDelete, onActivate, onSelectNode, t, nodeCount }: GroupCardProps) {
    const isAuto = group.group_type === "UrlTest"
    const isStatic = group.source.type === "Static"

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
    const nodeCountValue = group.source.node_ids?.length || 0
    const filterText = !isStatic ? (group.source.criteria?.keywords || []).join(", ") : ""

    return (
        <div
            onClick={() => onActivate(group.id)}
            className={cn(
                "glass-card relative flex flex-col p-5 rounded-2xl transition-all duration-300 group/card cursor-pointer border overflow-hidden",
                isActive
                    ? cn("shadow-lg bg-card-bg", config.activeBorder)
                    : "border-border-color hover:border-primary/30 hover:shadow-md bg-card-bg/50",
                "h-[140px]"
            )}
        >
            {/* Hover Glow Effect */}
            <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover/card:opacity-100 -skew-x-12 translate-x-[-100%] group-hover/card:translate-x-[100%] transition-transform duration-1000 ease-in-out pointer-events-none" />

            {/* Header Section */}
            <div className="flex justify-between items-start mb-4 z-10 relative">
                <div className="flex items-center gap-4">
                    {/* Icon Box */}
                    <div className={cn("size-12 rounded-xl flex items-center justify-center transition-all duration-300", config.bg, config.color, config.hoverBg)}>
                        <Icon size={24} strokeWidth={2} />
                    </div>

                    {/* Titles */}
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-base font-bold text-text-primary leading-tight flex items-center gap-2">
                            {group.name}
                            {isActive && (
                                <span className={cn("size-2 rounded-full animate-pulse", config.badge)} />
                            )}
                        </h3>
                        <p className="text-xs text-text-tertiary font-medium line-clamp-1 max-w-[150px]">
                            {isStatic
                                ? t('groups.contains_nodes', { count: nodeCountValue })
                                : t('groups.filter_desc', { keywords: filterText })
                            }
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div
                    className="flex items-center gap-1"
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

            {/* Bottom Metadata Section */}
            <div className="mt-auto flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3 z-10 relative">
                {/* Left: Mode/Type */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-text-secondary" title={t('groups.strategy')}>
                        <Activity size={14} className="text-text-tertiary" />
                        <span className="text-xs font-semibold">
                            {isAuto ? t('groups.auto_select') : t('groups.manual_select')}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-text-secondary">
                        {isStatic ? <Server size={14} className="text-text-tertiary" /> : <Filter size={14} className="text-text-tertiary" />}
                        <span className="text-xs font-semibold">
                            {isStatic ? "Static" : "Filter"}
                        </span>
                    </div>
                </div>

                {/* Right: Latency/Status (Placeholder for future latency integration) */}
                {isActive && (
                    <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                        <Check size={12} strokeWidth={3} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">{t('groups.active_exit')}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

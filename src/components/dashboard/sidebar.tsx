"use client"

import React from "react"
import { Search, Rocket, Globe, Settings, Sliders, Info, Server, Zap, LayoutGrid, Activity, Play, Square, ArrowDown, ArrowUp, Zap as ZapIcon, Power, Loader2, ChevronRight, RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { type } from '@tauri-apps/plugin-os'
import { Switch } from "@/components/ui/switch"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { toast } from "sonner"

export type ViewType = "dashboard" | "locations" | "rules" | "settings" | "proxies" | "groups" | "connections"

interface SidebarProps {
    currentView: ViewType
    onViewChange: (view: ViewType) => void
    subscription: {
        name: string
        upload: number
        download: number
        total: number
        expire: number
    } | null
    onSearchClick: () => void
    traffic: { up: number, down: number }
    isLoading?: boolean
    onToggle?: (restart?: boolean) => void
}

export function Sidebar({ currentView, onViewChange, subscription, onSearchClick, traffic, isLoading, onToggle }: SidebarProps) {
    const { t } = useTranslation()
    const [modifier, setModifier] = React.useState("⌘")

    React.useEffect(() => {
        try {
            const osType = type()
            if (osType === 'windows' || osType === 'linux') {
                setModifier("Ctrl")
            }
        } catch (e) {
            console.error("Failed to detect OS", e)
        }
    }, [])

    const getDisplayName = (name: string) => {
        const lower = name.toLowerCase()
        if (lower === "new subscription" || lower === "新订阅") return t('subscriptions.new_subscription')
        if (lower === "local import" || lower === "本地导入") return t('subscriptions.local_import')
        return name
    }



    // Formatting helper
    const formatBytes = (bytes: number, decimals = 1) => {
        if (!+bytes) return '0 B'
        const k = 1024
        const dm = decimals < 0 ? 0 : decimals
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }

    const used = (subscription?.upload || 0) + (subscription?.download || 0)
    const total = subscription?.total || 0
    const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0

    return (
        <aside className="w-[280px] glass-sidebar flex-col shrink-0 h-full z-40 transition-all duration-300 relative rounded-xl overflow-hidden shadow-floating md:flex hidden">
            {/* Window Controls Spacer / Drag Region */}
            <div data-tauri-drag-region className="h-12 w-full cursor-default shrink-0" />

            <div className="px-4 mb-6">
                <div
                    className="relative group cursor-pointer"
                    onClick={onSearchClick}
                >
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary size-[18px] group-hover:text-primary transition-colors" />
                    <input
                        className="w-full bg-black/5 dark:bg-white/10 border border-transparent group-hover:border-primary/20 rounded-lg pl-9 pr-12 py-1.5 text-sm text-primary placeholder-gray-500 cursor-pointer pointer-events-none transition-all shadow-inner"
                        placeholder={t('sidebar.search_placeholder', { defaultValue: "Search..." })}
                        type="text"
                        readOnly
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                        <kbd className="hidden sm:flex h-5 select-none items-center gap-1 rounded border border-black/10 dark:border-white/10 bg-black/5 px-1.5 font-mono text-[10px] font-medium text-tertiary">
                            <span className={cn(modifier === "Ctrl" ? "text-[10px] font-bold" : "text-sm top-[0.5px] relative")}>{modifier}</span>K
                        </kbd>
                    </div>
                </div>
            </div>

            <nav className="flex flex-col gap-1 w-full px-3 flex-1 overflow-y-auto sidebar-scroll">
                <div className="text-[10px] font-bold text-tertiary px-3 mb-2 mt-2 tracking-widest uppercase">{t('sidebar.network', { defaultValue: 'Network' })}</div>

                <NavItem
                    icon={<Rocket size={20} />}
                    label={t('sidebar.dashboard')}
                    active={currentView === "dashboard"}
                    onClick={() => onViewChange("dashboard")}
                />

                <NavItem
                    icon={<Activity size={20} />}
                    label={t('sidebar.connections', { defaultValue: 'Connections' })}
                    active={currentView === "connections"}
                    onClick={() => onViewChange("connections")}
                />
                <NavItem
                    icon={<Globe size={20} />}
                    label={t('sidebar.locations')}
                    active={currentView === "locations"}
                    onClick={() => onViewChange("locations")}
                />

                <NavItem
                    icon={<LayoutGrid size={20} />}
                    label={t('sidebar.groups')}
                    active={currentView === "groups"}
                    onClick={() => onViewChange("groups")}
                />

                <NavItem
                    icon={<Sliders size={20} />}
                    label={t('sidebar.rules')}
                    active={currentView === "rules"}
                    onClick={() => onViewChange("rules")}
                />

                <div className="text-[10px] font-bold text-tertiary px-3 mb-2 mt-6 tracking-widest uppercase">{t('sidebar.system')}</div>

                <NavItem
                    icon={<Settings size={20} />}
                    label={t('sidebar.settings')}
                    active={currentView === "settings"}
                    onClick={() => onViewChange("settings")}
                />
            </nav>

            <div className="p-4 mt-auto space-y-3">
                <SidebarStatusWidget
                    traffic={traffic}
                    isLoading={isLoading}
                    onToggle={onToggle}
                />

                <div
                    onClick={() => onViewChange("proxies")}
                    className={cn(
                        "rounded-lg px-3 py-2 transition-all duration-200 cursor-pointer group select-none",
                        "hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
                    )}
                >
                    {subscription ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-secondary group-hover:text-primary transition-colors truncate max-w-[120px]" title={getDisplayName(subscription.name) || t('sidebar.subscription')}>{getDisplayName(subscription.name) || t('sidebar.subscription')}</span>
                                {subscription.expire && subscription.expire * 1000 < Date.now() ? (
                                    <span className="text-[10px] font-medium text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">{t('sidebar.expired')}</span>
                                ) : (
                                    <span className="text-[10px] font-medium text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">
                                        {subscription.expire
                                            ? t('subscriptions.remaining_days', {
                                                count: Math.max(1, Math.floor((subscription.expire - Date.now() / 1000) / 86400)),
                                                defaultValue: `Remaining ${Math.max(1, Math.floor((subscription.expire - Date.now() / 1000) / 86400))} days`
                                            })
                                            : (total > 0 ? t('sidebar.active') : t('sidebar.unlimited'))
                                        }
                                    </span>
                                )}
                            </div>

                            {total > 0 ? (
                                <div className="space-y-1.5">
                                    <div className="h-1 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-500"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[10px] text-tertiary font-medium">
                                        <span>{formatBytes(used)}</span>
                                        <span>{formatBytes(total)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="h-1 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-accent-green w-full opacity-50" />
                                    </div>
                                    <div className="flex justify-between text-[10px] text-tertiary font-medium">
                                        <span>{formatBytes(used)}</span>
                                        <span>∞</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center size-8 rounded-full bg-black/5 dark:bg-white/5 text-tertiary group-hover:bg-primary/10 group-hover:text-primary transition-all">
                                <Zap size={16} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-secondary group-hover:text-primary transition-colors">{t('sidebar.subscription')}</span>
                                <span className="text-[10px] text-tertiary">{t('sidebar.no_active_plan')}</span>
                            </div>
                        </div>
                    )}
                </div>


            </div>
        </aside >
    )
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean, onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-all group text-left",
                active
                    ? "bg-primary text-white shadow-sm ring-1 ring-white/10"
                    : "text-secondary hover:text-primary hover:bg-black/5 dark:hover:bg-white/10"
            )}
        >
            <span className={cn("transition-transform", !active && "group-hover:scale-105")}>
                {icon}
            </span>
            <span className="text-sm font-medium">{label}</span>
        </button>
    )
}


interface SidebarStatusWidgetProps {
    traffic: { up: number, down: number }
    isLoading?: boolean
    onToggle?: (restart?: boolean) => void
}

function SidebarStatusWidget({ traffic, isLoading, onToggle }: SidebarStatusWidgetProps) {
    const { t } = useTranslation()
    const [status, setStatus] = React.useState<any>(null)
    const [isInternalPending, setIsInternalPending] = React.useState(false)

    // Merge external loading and internal pending
    const isPending = isLoading || isInternalPending

    // Poll status initially and listen for changes
    const fetchStatus = React.useCallback(async () => {
        try {
            const s = await invoke("get_proxy_status") as any
            setStatus(s)
        } catch (e) {
            console.error("Failed to fetch proxy status", e)
        }
    }, [])

    React.useEffect(() => {
        fetchStatus()
        const unlisten = listen("proxy-status-change", (event: any) => {
            setStatus(event.payload)
        })
        return () => {
            unlisten.then(f => f())
        }
    }, [fetchStatus])



    const handleRestart = async () => {
        if (!onToggle) return
        onToggle(true)
    }

    // Formatting
    const formatSpeed = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B/s`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
        return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
    }

    if (!status) return null

    return (
        <div className="relative overflow-hidden group rounded-lg">
            <div className="relative z-10 px-1 space-y-2 pt-2">
                {/* Minimal Header: Status Text + Restart Button */}
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2 text-tertiary">
                        <div className={cn("size-2 rounded-full transition-colors duration-500", status.is_running ? "bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-zinc-400/50")} />
                        <span className={cn("text-[11px] font-semibold tracking-wide uppercase transition-colors", status.is_running ? "text-secondary" : "text-tertiary")}>
                            {status.is_running ? t('status.active') : t('status.stopped')}
                        </span>
                    </div>
                    <button
                        onClick={handleRestart}
                        disabled={isPending}
                        className={cn(
                            "group relative p-1.5 rounded-lg transition-all duration-300 border border-transparent",
                            status.is_running ? "bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/20" : "bg-white/5 text-tertiary hover:bg-white/10 hover:text-secondary",
                            isPending && "cursor-wait opacity-80"
                        )}
                        title={status.is_running ? "Restart" : "Start"}
                    >
                        {isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <RotateCcw size={14} className={cn("transition-transform duration-500", status.is_running && "group-hover:-rotate-180")} />
                        )}
                    </button>
                </div>

                {/* Compact Info Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
                    {/* Info Text Row (Now Top) */}
                    <div className="col-span-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 max-w-[50%] overflow-hidden" title={status.node?.name || "None"}>
                            <ZapIcon size={10} className="text-tertiary shrink-0" />
                            <span className="text-[10px] text-tertiary truncate">
                                {status.node?.name || "None"}
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[10px] text-tertiary">
                                {status.routing_mode === "global" ? t('mode.global', 'Global') :
                                    status.routing_mode === "direct" ? t('mode.direct', 'Direct') :
                                        t('mode.rule', 'Rule')}
                            </span>
                            <Sliders size={10} className="text-tertiary shrink-0" />
                        </div>
                    </div>

                    {/* Speed Row (Now Bottom) */}
                    <div className="col-span-2 flex items-center justify-between text-[10px] text-tertiary font-mono opacity-80 border-t border-black/5 dark:border-white/5 pt-1.5 mt-0.5">
                        <div className="flex items-center gap-1.5">
                            <ArrowUp size={10} className={traffic.up > 0 ? "text-emerald-500" : "text-inherit opacity-50"} />
                            <span>{formatSpeed(traffic.up)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <ArrowDown size={10} className={traffic.down > 0 ? "text-primary" : "text-inherit opacity-50"} />
                            <span>{formatSpeed(traffic.down)}</span>
                        </div>
                    </div>
                </div>

                {/* Sparkline at the bottom */}
                <div className="relative h-8 -mx-1 -mt-2 pointer-events-none overflow-hidden opacity-50">
                    <Sparkline traffic={traffic} isRunning={status.is_running} />
                </div>
            </div>
        </div>
    )
}

function Sparkline({ traffic, isRunning }: { traffic: { up: number, down: number }, isRunning: boolean }) {
    const [history, setHistory] = React.useState<{ up: number, down: number }[]>(new Array(40).fill({ up: 0, down: 0 }))

    React.useEffect(() => {
        if (!isRunning) {
            setHistory(new Array(40).fill({ up: 0, down: 0 }))
            return
        }
        setHistory(prev => {
            const next = [...prev, traffic]
            if (next.length > 40) next.shift()
            return next
        })
    }, [traffic, isRunning])

    const width = 100
    const height = 100
    // Dynamic scale: use actual max speed but set a lower floor (100KB/s) to make low speeds visible
    const maxVal = Math.max(100 * 1024, ...history.map(h => Math.max(h.down, h.up)))

    // Helper to generate smooth bezier curves
    const getSmoothPath = (data: number[], isArea: boolean) => {
        if (data.length === 0) return ""
        const step = width / (data.length - 1)

        const points = data.map((val, i) => ({
            x: i * step,
            y: height - (val / maxVal) * height * 0.8 // Increased drawing area for better visibility
        }))

        if (points.length < 2) return ""

        let d = `M ${points[0].x} ${points[0].y}`

        for (let i = 0; i < points.length - 1; i++) {
            const curr = points[i]
            const next = points[i + 1]
            const midX = (curr.x + next.x) / 2
            d += ` Q ${curr.x} ${curr.y} ${midX} ${(curr.y + next.y) / 2}`
        }

        const last = points[points.length - 1]
        d += ` L ${last.x} ${last.y}`

        if (isArea) {
            d += ` L ${width} ${height} L 0 ${height} Z`
        }
        return d
    }

    const downData = history.map(h => h.down)
    const upData = history.map(h => h.up)

    // Colors that match the theme
    const colorUp = "rgb(16, 185, 129)"   // Emerald 500
    const colorDown = "rgb(59, 130, 246)" // Blue 500 (Primary)

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full absolute inset-0 pointer-events-none" preserveAspectRatio="none">
            <defs>
                <linearGradient id="gradient-up" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorUp} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={colorUp} stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="gradient-down" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorDown} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={colorDown} stopOpacity="0.05" />
                </linearGradient>
            </defs>

            {/* Up Stream (Green) */}
            <path d={getSmoothPath(upData, true)} fill="url(#gradient-up)" className="transition-all duration-300 ease-linear" />
            <path d={getSmoothPath(upData, false)} stroke={colorUp} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" className="opacity-40 transition-all duration-300 ease-linear" />

            {/* Down Stream (Blue) */}
            <path d={getSmoothPath(downData, true)} fill="url(#gradient-down)" className="transition-all duration-300 ease-linear" />
            <path d={getSmoothPath(downData, false)} stroke={colorDown} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" className="opacity-60 transition-all duration-300 ease-linear" />
        </svg>
    )
}

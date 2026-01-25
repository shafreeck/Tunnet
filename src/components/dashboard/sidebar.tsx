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

            <div className="px-3 pb-3 pt-1 mt-auto space-y-2">
                <SidebarStatusWidget
                    traffic={traffic}
                    isLoading={isLoading}
                    onToggle={onToggle}
                />

                <div
                    onClick={() => onViewChange("proxies")}
                    className={cn(
                        "relative group cursor-pointer select-none transition-all duration-300",
                        "bg-primary/3 dark:bg-primary/4 backdrop-blur-sm hover:bg-primary/6 dark:hover:bg-primary/8",
                        "border border-primary/10 dark:border-primary/8 hover:border-primary/20 dark:hover:border-primary/20",
                        "rounded-xl p-2.5 shadow-sm hover:shadow-md active:scale-[0.98]"
                    )}
                >
                    {/* Header: Icon + Name + Chevron */}
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="p-1 rounded-lg bg-primary/10 text-primary shrink-0 transition-transform group-hover:scale-110">
                                <Zap size={12} className="fill-current" />
                            </div>
                            <span className="text-xs font-bold text-secondary truncate group-hover:text-primary transition-colors">
                                {subscription ? getDisplayName(subscription.name) : t('sidebar.no_subscription')}
                            </span>
                        </div>
                        <ChevronRight size={12} className="text-tertiary transition-transform group-hover:translate-x-1" />
                    </div>

                    {subscription ? (
                        <div className="space-y-1.5">
                            {/* Stats Line (Used / Total + Expire) */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[11px] font-mono font-bold text-secondary">{formatBytes(used, 1).split(' ')[0]}</span>
                                    <span className="text-[9px] font-medium text-tertiary uppercase">{formatBytes(used, 1).split(' ')[1]}</span>
                                    <span className="text-[9px] text-tertiary/40 px-0.5">/</span>
                                    <span className="text-[9px] font-medium text-tertiary">{total > 0 ? formatBytes(total) : '∞'}</span>
                                </div>

                                {subscription.expire && subscription.expire * 1000 < Date.now() ? (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 font-bold uppercase tracking-wider">{t('sidebar.expired')}</span>
                                ) : (
                                    <div className="px-1.5 py-0.5 rounded-md bg-accent-green/10 text-accent-green text-[9px] font-bold uppercase tracking-wider">
                                        {subscription.expire
                                            ? t('subscriptions.remaining_days', {
                                                count: Math.max(1, Math.floor((subscription.expire - Date.now() / 1000) / 86400)),
                                                defaultValue: `${Math.max(1, Math.floor((subscription.expire - Date.now() / 1000) / 86400))}D`
                                            })
                                            : (total > 0 ? t('sidebar.active') : t('sidebar.unlimited'))
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Slim Progress Bar */}
                            <div className="relative h-1 w-full bg-primary/10 dark:bg-primary/10 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        "absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out",
                                        percent > 90 ? "bg-red-500" : percent > 75 ? "bg-orange-500" : "bg-accent-green"
                                    )}
                                    style={{ width: `${percent}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/10 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="py-2 text-center text-[10px] text-tertiary italic opacity-60">
                            {t('sidebar.click_to_manage', { defaultValue: 'Click to manage subscriptions' })}
                        </div>
                    )}
                </div>

                <div
                    onClick={() => onViewChange("proxies")}
                    className="flex md:hidden items-center gap-2 p-2 rounded-lg bg-primary/5 dark:bg-primary/10 text-tertiary"
                >
                    <Zap size={16} />
                    <span className="text-xs">{subscription ? getDisplayName(subscription.name) : t('sidebar.no_subscription')}</span>
                </div>
            </div>
        </aside>
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
        <div className="relative overflow-hidden group">
            <div className="relative z-10 px-1 space-y-2">
                {/* Minimal Header: Status Text + Restart Button */}
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "size-2 rounded-full transition-colors duration-500",
                            isPending
                                ? (status.is_running ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse")
                                : (status.is_running ? "bg-accent-green shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-zinc-400/50")
                        )} />
                        <span className={cn(
                            "text-[10px] font-bold tracking-wider uppercase transition-colors",
                            status.is_running ? "text-secondary" : "text-tertiary"
                        )}>
                            {isPending
                                ? (status.is_running ? t('status.stopping') : t('status.starting'))
                                : (status.is_running ? t('status.active') : t('status.stopped'))
                            }
                        </span>
                    </div>
                    <button
                        onClick={handleRestart}
                        disabled={isPending}
                        className={cn(
                            "group relative p-1 rounded-lg transition-all duration-300 border border-transparent",
                            status.is_running ? "bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/20" : "bg-white/5 text-tertiary hover:bg-white/10 hover:text-secondary",
                            isPending && "cursor-wait opacity-80"
                        )}
                        title={status.is_running ? "Restart" : "Start"}
                    >
                        {isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <RotateCcw size={12} className={cn("transition-transform duration-500", status.is_running && "group-hover:-rotate-180")} />
                        )}
                    </button>
                </div>

                {/* Compact Info Grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {/* Info Text Row (Now Top) */}
                    <div className="col-span-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 max-w-[60%] overflow-hidden" title={status.node?.name || "None"}>
                            <ZapIcon size={10} className={cn("shrink-0 transition-colors", status.is_running ? "text-primary/70" : "text-tertiary")} />
                            <span className={cn("text-[10px] truncate transition-colors", status.is_running ? "text-secondary font-bold" : "text-tertiary font-medium")}>
                                {status.node?.name || "None"}
                            </span>
                        </div>

                        <div className="flex items-center gap-1 justify-end">
                            <span className="text-[10px] text-tertiary font-medium">
                                {status.routing_mode === "global" ? t('status.mode.global') :
                                    status.routing_mode === "direct" ? t('status.mode.direct') :
                                        t('status.mode.rule')}
                            </span>
                            <Sliders size={10} className="text-tertiary/60 shrink-0" />
                        </div>
                    </div>

                    {/* Speed Row (Now Bottom) */}
                    <div className="col-span-2 flex items-center justify-between text-[10px] font-mono border-t border-black/5 dark:border-white/5 pt-1.5 mt-0.5">
                        <div className={cn("flex items-center gap-1 transition-colors", traffic.up > 0 ? "text-emerald-500 font-bold" : "text-tertiary opacity-60")}>
                            <ArrowUp size={10} className={cn("transition-transform", traffic.up > 0 && "animate-pulse")} />
                            <span>{formatSpeed(traffic.up)}</span>
                        </div>
                        <div className={cn("flex items-center gap-1 transition-colors", traffic.down > 0 ? "text-primary font-bold" : "text-tertiary opacity-60")}>
                            <ArrowDown size={10} className={cn("transition-transform", traffic.down > 0 && "animate-pulse")} />
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

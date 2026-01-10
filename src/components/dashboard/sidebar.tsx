"use client"

import React from "react"
import { Search, Rocket, Globe, Settings, Sliders, Info, Server, Zap, LayoutGrid } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export type ViewType = "dashboard" | "locations" | "rules" | "settings" | "proxies" | "groups"

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
}

export function Sidebar({ currentView, onViewChange, subscription, onSearchClick }: SidebarProps) {
    const { t } = useTranslation()

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
        <aside className="w-[280px] glass-sidebar flex flex-col shrink-0 h-full z-40 transition-all duration-300 relative rounded-xl overflow-hidden shadow-floating md:flex hidden">
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
                        <kbd className="hidden sm:flex h-5 select-none items-center gap-1 rounded border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-1.5 font-mono text-[10px] font-medium text-tertiary">
                            <span className="text-sm">⌘</span>K
                        </kbd>
                    </div>
                </div>
            </div>

            <nav className="flex flex-col gap-1 w-full px-3 flex-1 overflow-y-auto sidebar-scroll">
                <div className="text-[10px] font-bold text-tertiary px-3 mb-2 mt-2 tracking-wider uppercase tracking-[0.1em]">{t('sidebar.network', { defaultValue: 'Network' })}</div>

                <NavItem
                    icon={<Rocket size={20} />}
                    label={t('sidebar.dashboard')}
                    active={currentView === "dashboard"}
                    onClick={() => onViewChange("dashboard")}
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

                <div className="text-[10px] font-bold text-tertiary px-3 mb-2 mt-6 tracking-wider uppercase tracking-[0.1em]">{t('sidebar.system')}</div>

                <NavItem
                    icon={<Settings size={20} />}
                    label={t('sidebar.settings')}
                    active={currentView === "settings"}
                    onClick={() => onViewChange("settings")}
                />
            </nav>

            <div className="p-4 mt-auto">
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


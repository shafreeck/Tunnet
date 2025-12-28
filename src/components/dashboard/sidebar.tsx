"use client"

import React from "react"
import { Search, Rocket, Globe, Settings, Sliders, Info, Server } from "lucide-react"
import { cn } from "@/lib/utils"

export type ViewType = "dashboard" | "locations" | "rules" | "settings" | "proxies"

interface SidebarProps {
    currentView: ViewType
    onViewChange: (view: ViewType) => void
    subscription: {
        upload: number
        download: number
        total: number
        expire: number
    } | null
}

export function Sidebar({ currentView, onViewChange, subscription }: SidebarProps) {

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
        <aside className="w-[280px] glass-sidebar flex flex-col shrink-0 h-full z-40 transition-all duration-300 relative rounded-xl overflow-hidden shadow-floating">
            {/* Window Controls Spacer / Drag Region */}
            <div data-tauri-drag-region className="h-12 w-full cursor-default shrink-0" />

            <div className="px-4 mb-6">
                <div className="relative group">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 size-[18px] group-focus-within:text-white transition-colors" />
                    <input
                        className="w-full bg-white/10 border border-transparent focus:border-white/20 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-400 focus:ring-0 focus:bg-white/15 transition-all shadow-inner"
                        placeholder="Search"
                        type="text"
                    />
                </div>
            </div>

            <nav className="flex flex-col gap-1 w-full px-3 flex-1 overflow-y-auto sidebar-scroll">
                <div className="text-[10px] font-bold text-text-tertiary px-3 mb-2 mt-2 tracking-wider">NETWORK</div>

                <NavItem
                    icon={<Rocket size={20} />}
                    label="Dashboard"
                    active={currentView === "dashboard"}
                    onClick={() => onViewChange("dashboard")}
                />
                <NavItem
                    icon={<Globe size={20} />}
                    label="Locations"
                    active={currentView === "locations"}
                    onClick={() => onViewChange("locations")}
                />

                <NavItem
                    icon={<Sliders size={20} />}
                    label="Rules"
                    active={currentView === "rules"}
                    onClick={() => onViewChange("rules")}
                />

                <div className="text-[10px] font-bold text-text-tertiary px-3 mb-2 mt-6 tracking-wider">SYSTEM</div>

                <NavItem
                    icon={<Settings size={20} />}
                    label="Settings"
                    active={currentView === "settings"}
                    onClick={() => onViewChange("settings")}
                />
            </nav>

            <div className="p-4 mt-auto">
                <div
                    onClick={() => onViewChange("proxies")}
                    className={cn(
                        "p-3 rounded-xl bg-white/5 border border-white/5 space-y-3 transition-all duration-200 cursor-pointer group",
                        "hover:bg-white/10 hover:border-white/10 hover:shadow-lg active:scale-95"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">Subscription Status</span>
                        {total > 0 && (
                            <span className="text-[10px] text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">Active</span>
                        )}
                    </div>

                    {total > 0 ? (
                        <>
                            <div className="space-y-1">
                                <div className="flex justify-between text-[11px] text-gray-400">
                                    <span>Used: {formatBytes(used)}</span>
                                    <span>Total: {formatBytes(total)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-accent-green to-emerald-400 transition-all duration-500"
                                        style={{ width: `${percent}%` }}
                                    />
                                </div>
                            </div>
                            {subscription?.expire && (
                                <div className="text-[10px] text-gray-500 text-right">
                                    Exp: {new Date(subscription.expire * 1000).toLocaleDateString()}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-xs text-text-tertiary group-hover:text-gray-400 transition-colors">
                            Tunnet v0.1.0-alpha
                            <br />
                            <span className="text-[10px] opacity-70">No active subscription data</span>
                        </div>
                    )}
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
                    ? "bg-primary/45 text-white shadow-sm ring-1 ring-white/5"
                    : "text-gray-300 hover:text-white hover:bg-white/10"
            )}
        >
            <span className={cn("transition-transform", !active && "group-hover:scale-105")}>
                {icon}
            </span>
            <span className="text-sm font-medium">{label}</span>
        </button>
    )
}


"use client"

import React, { useState } from "react"
import { ArrowUpDown, Filter, Play, Square, Plus, Pencil, Trash2, Globe, RotateCw, Search, Scroll, Pause, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

interface Server {
    id: string
    name: string
    provider: string
    ping: number
    country: string
    flagUrl: string
    type?: "Active" | "Netflix" | "Gaming"
    status?: "active" | "idle"
}

// Keep hardcoded servers for demo/fallback? Or start empty?
// Let's keep them mixed or just dynamic. For this task, dynamic is key.
const initialServers: Server[] = [
    {
        id: "1",
        name: "Hong Kong 01",
        provider: "HKT Limited - Optimized for Streaming",
        ping: 45,
        country: "Hong Kong",
        flagUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCucQg4n34yd3QMQ4fc9RSVKg8-YnPfg73qbYRg7COVPQOl6MeGgys4Rmt_STjZSVKOxrZR3pv4ifWh3seEhW2K5uz2ovPscBch3I5mjp9UlFrEEbj6de-WN8RiiVCKFAFGsHYEjFpWlmweRkZA6HAUKkAUzLSlH0ufbVZMYD5Y945ZWV4C5ALUJVDB2i2RLSWqJzlbeAZVME0g8ylE2xtlFR4GD6OOa14hLUF5g26U7e2RU8TTVk1_b-G7doWI-akhuGijnPDYOvV6",
        type: "Active",
        status: "active"
    }
]

import { LogViewer } from "./log-viewer"

interface ServerListProps {
    servers: Server[]
    activeServerId: string | null
    isConnected: boolean
    onSelect: (id: string) => void
    onToggle: (id: string) => void
    onImport: (url: string) => Promise<void>
    onEdit: (node: Server | null) => void // null means add new
    onDelete: (id: string) => void
    showLogs: boolean
    setShowLogs: (show: boolean) => void
    logs: string[]
    onClearLogs: () => void
    onPing?: (id: string) => void
    hideHeader?: boolean
}

export function ServerList({
    servers,
    activeServerId,
    isConnected,
    onSelect,
    onToggle,
    onImport,
    onEdit,
    onDelete,
    showLogs,
    setShowLogs,
    logs,
    onClearLogs,
    onPing,
    hideHeader = false
}: ServerListProps) {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(false)
    const [logFilter, setLogFilter] = useState("")
    const [autoScroll, setAutoScroll] = useState(true)

    // Deferred Pinning Logic
    // We only change the "visual" pinned ID when the user scrolls to the top.
    // This prevents items from jumping under the cursor while browsing down the list.
    const [pinnedServerId, setPinnedServerId] = useState<string | null>(activeServerId)
    const [pendingPinId, setPendingPinId] = useState<string | null>(null)
    const listTopRef = React.useRef<HTMLDivElement>(null)
    const isTopVisibleRef = React.useRef(true) // Default to true so initial load pins correctly

    // 1. Observe visibility of the top of the list
    React.useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                isTopVisibleRef.current = entry.isIntersecting

                // If top becomes visible and we have a pending pin, apply it now
                if (entry.isIntersecting && pendingPinId) {
                    setPinnedServerId(pendingPinId)
                    setPendingPinId(null)
                }
            },
            { threshold: 0.1 } // Trigger even if only slightly visible
        )

        if (listTopRef.current) {
            observer.observe(listTopRef.current)
        }

        return () => observer.disconnect()
    }, [pendingPinId])

    // 2. When active ID changes:
    // - If top is visible: Pin immediately (e.g. initial load or user is at top)
    // - If top is hidden: Queue it as pending
    React.useEffect(() => {
        if (activeServerId !== pinnedServerId) {
            if (isTopVisibleRef.current) {
                setPinnedServerId(activeServerId)
                setPendingPinId(null)
            } else {
                setPendingPinId(activeServerId)
            }
        }
    }, [activeServerId, pinnedServerId])

    // Sort logic using pinnedServerId instead of activeServerId directly
    const sortedServers = React.useMemo(() => {
        return [...servers].sort((a, b) => {
            if (a.id === pinnedServerId) return -1
            if (b.id === pinnedServerId) return 1
            return 0
        })
    }, [servers, pinnedServerId])


    const handleCopyLogs = () => {
        const text = logs.join("\n")
        navigator.clipboard.writeText(text)
        toast.success(t('logs_copied', { defaultValue: "Logs copied to clipboard" }))
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 relative">
            {!hideHeader && (
                <div className="flex items-center justify-between mb-4 mt-2 px-1 shrink-0 sticky top-0 bg-sidebar-bg backdrop-blur-xl z-20 py-2 -mx-1 rounded-t-xl border-b border-border-color">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setShowLogs(false)}
                            className={cn(
                                "text-[10px] font-bold uppercase tracking-widest pl-1 transition-colors",
                                !showLogs ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
                            )}
                        >
                            {t('server_list', { defaultValue: 'Server List' })} {loading && `(${t('loading', { defaultValue: 'Loading...' })})`}
                        </button>
                        <button
                            onClick={() => setShowLogs(true)}
                            className={cn(
                                "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                                showLogs ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
                            )}
                        >
                            {t('logs', { defaultValue: 'Logs' })}
                            <div className={cn("size-1.5 rounded-full transition-colors", showLogs ? "bg-accent-green" : "bg-text-tertiary/20")} />
                        </button>
                    </div>

                    {!showLogs ? (
                        <div className="flex gap-2">
                            <button
                                onClick={() => onEdit(null)} // Trigger Add New
                                className={cn(
                                    "p-1.5 transition-colors rounded hover:bg-black/5 dark:hover:bg-white/5",
                                    "text-text-secondary hover:text-text-primary"
                                )}
                                title="Add New Node"
                            >
                                <Plus size={16} />
                            </button>
                            {/* Filter button placeholder */}
                            <button className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded hover:bg-black/5 dark:hover:bg-white/5">
                                <Filter size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div className="relative group">
                                <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 size-3 text-text-tertiary" />
                                <input
                                    type="text"
                                    placeholder="Filter..."
                                    value={logFilter}
                                    onChange={e => setLogFilter(e.target.value)}
                                    className="bg-black/5 dark:bg-black/20 border border-border-color rounded pl-6 pr-2 py-0.5 text-[10px] text-text-primary focus:border-primary/50 w-24 focus:w-32 transition-all outline-none"
                                />
                            </div>

                            <div className="h-3 w-px bg-border-color mx-1"></div>

                            <button
                                onClick={() => setAutoScroll(!autoScroll)}
                                className={cn("p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors", autoScroll ? "text-accent-green" : "text-text-secondary")}
                                title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
                            >
                                {autoScroll ? <Scroll size={14} /> : <Pause size={14} />}
                            </button>

                            <button onClick={handleCopyLogs} className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors" title="Copy Logs">
                                <Copy size={14} />
                            </button>

                            <button onClick={onClearLogs} className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-secondary hover:text-red-500 transition-colors" title="Clear Logs">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1">
                {showLogs ? (
                    <LogViewer
                        logs={logs}
                        onClear={onClearLogs}
                        filter={logFilter}
                        autoScroll={autoScroll}
                        className="h-[calc(100vh-180px)] border-none bg-transparent backdrop-blur-none"
                    />
                ) : (
                    <div className="space-y-3 pb-12">
                        {/* Sentinel element to detect top of list */}
                        <div ref={listTopRef} className="h-px w-full absolute -top-10 opacity-0 pointer-events-none" />

                        {sortedServers.map((server) => {
                            const isSelected = server.id === activeServerId
                            const isRunning = isSelected && isConnected

                            return (
                                <ServerItem
                                    key={server.id}
                                    server={server}
                                    isSelected={isSelected}
                                    isRunning={isRunning}
                                    onClick={() => onSelect(server.id)}
                                    onToggle={() => onToggle(server.id)}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    onPing={onPing}
                                    t={t}
                                />
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

interface ServerItemProps {
    server: Server
    isSelected: boolean
    isRunning: boolean
    onClick: () => void
    onToggle: () => Promise<void> | void
    onEdit: (node: Server) => void
    onDelete: (id: string) => void
    onPing?: (id: string) => void
    t: any // Using specific type TFunction is better but 'any' works for quick fix to match immediate error context, or import TFunction. Let's use 'any' to avoid import hassle or `ReturnType<typeof useTranslation>['t']`.
}

function ServerItem({ server, isSelected, isRunning, onClick, onToggle, onEdit, onDelete, onPing, t }: ServerItemProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "group flex items-center p-3 rounded-xl cursor-pointer relative overflow-hidden transition-all duration-200 border border-transparent",
                isSelected
                    ? "bg-primary/10 dark:bg-primary/20 border-primary/20" // Selected: Tinted
                    : "bg-black/5 dark:bg-white/5 hover:bg-black/20 dark:hover:bg-white/25", // Idle: Subtle (5%), Hover: Very Distinct/Solid (25%)
                // If running, we might want a different border or glow?
                // For now, relies on the `isRunning` indicator within the card.
                isRunning && "border-primary/30"
            )}>

            {isSelected && <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-colors", isRunning ? "bg-accent-green shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-primary")} ></div>}

            <div className="size-10 rounded-full bg-black/5 dark:bg-black/30 overflow-hidden flex-shrink-0 mr-4 shadow-inner ml-2 flex items-center justify-center">
                {server.flagUrl ? (
                    <img className="w-full h-full object-cover" src={server.flagUrl} alt={server.country} />
                ) : (
                    <Globe className="text-gray-400 size-6 opacity-50" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className={cn(
                        "font-medium truncate text-sm transition-colors",
                        isSelected ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
                    )}>
                        {server.name}
                    </h4>
                    {/* Show "Connected" tag if running, otherwise show Type or nothing */}
                    {isRunning ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold border bg-accent-green/20 text-accent-green border-accent-green/20 animate-pulse">
                            {t('status.connected')}
                        </span>
                    ) : (server.type && (
                        <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-semibold border",
                            server.type === "Active" && "bg-accent-green/20 text-accent-green border-accent-green/20",
                            server.type === "Netflix" && "bg-purple-500/10 text-purple-400 border-purple-500/10",
                            server.type === "Gaming" && "bg-blue-500/10 text-blue-400 border-blue-500/10"
                        )}>
                            {server.type}
                        </span>
                    ))}
                </div>
                <p className="text-text-tertiary text-xs truncate mt-0.5 group-hover:text-text-secondary">
                    {server.provider}
                </p>
            </div>

            <div className="flex items-center gap-5 mr-2">
                <div className="flex items-center justify-end min-w-[60px]">
                    {/* Latency - Hidden on hover */}
                    <div className="text-right flex flex-col items-end group-hover:hidden transition-all duration-200">
                        <span className={cn(
                            "font-mono text-xs font-bold",
                            server.ping === 0 ? "text-accent-red" : server.ping < 150 ? "text-accent-green" : server.ping < 300 ? "text-accent-orange" : "text-accent-red"
                        )}>
                            {server.ping > 0 ? `${server.ping}ms` : '-'}
                        </span>
                        {isSelected && <span className="text-[10px] text-text-secondary">Ping</span>}
                    </div>

                    {/* Action Buttons - Visible on hover, replaces Latency */}
                    <div className="hidden group-hover:flex items-center gap-1 transition-all duration-200 animate-in fade-in slide-in-from-right-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onPing && onPing(server.id); }}
                            className="p-1.5 text-text-secondary hover:text-accent-green hover:bg-accent-green/10 rounded-lg transition-colors"
                            title="Test Latency"
                        >
                            <RotateCw size={14} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(server); }}
                            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                            title="Edit"
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(server.id);
                            }}
                            className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                <div
                    className="size-8 flex items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 z-10"
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggle()
                    }}
                >
                    {/* Icon Logic:
                        - If Running: Show Stop (Square) or Active indicator.
                        - If Selected (but not running): Show Play (Ready).
                        - If Idle: Show Play (Opacity 0 -> 1 on hover).
                     */}
                    {isRunning ? (
                        <div className="bg-accent-green text-black p-1.5 rounded-full shadow-[0_0_15px_rgba(34,197,94,0.6)]">
                            <Square size={12} fill="black" />
                        </div>
                    ) : isSelected ? (
                        <div className="bg-primary text-white p-1.5 rounded-full shadow-lg shadow-primary/30">
                            <Play size={14} fill="white" className="ml-0.5" />
                        </div>
                    ) : (
                        <Play size={16} fill="currentColor" className="text-text-secondary group-hover:text-text-primary opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all" />
                    )}
                </div>
            </div>
        </div>
    )
}

"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { Search, X, Network, Wifi, Activity, ArrowUp, ArrowDown, Clock, AlertCircle, Monitor, Globe, Unplug } from "lucide-react"
import { cn } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

interface Connection {
    id: string
    metadata: {
        network: string
        type: string
        sourceIP: string
        destinationIP: string
        sourcePort: string
        destinationPort: string
        host: string
        process?: string
        processPath?: string
    }
    upload: number
    download: number
    start: string // ISO timestamp or just string from backend
    chains: string[]
    rule: string
    rulePayload: string
}

interface ConnectionsResponse {
    downloadTotal: number
    uploadTotal: number
    connections: Connection[]
}

const formatBytes = (bytes: number, decimals = 1) => {
    if (!+bytes) return '0 B'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

const formatSpeed = (bytesPerSec: number) => {
    return `${formatBytes(bytesPerSec)}/s`
}

const formatDuration = (startDate: string) => {
    const start = new Date(startDate).getTime();
    if (isNaN(start)) return "0s";
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - start) / 1000));

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export function ConnectionsView() {
    const { t } = useTranslation()
    const [connections, setConnections] = useState<Connection[]>([])
    const [totalSpeed, setTotalSpeed] = useState({ up: 0, down: 0 })
    const [searchQuery, setSearchQuery] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isMac, setIsMac] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
    }, [])

    const fetchConnections = async () => {
        try {
            const data = await invoke<ConnectionsResponse>("get_connections")
            setConnections(data.connections)
            setTotalSpeed({ up: data.uploadTotal, down: data.downloadTotal })
            setIsLoading(false)
            setError(null)
        } catch (e: any) {
            // Only show error if it persists or strictly failed (ignore minor network glitches if previously succeeded?)
            // Actually, if proxy is stopped, this will fail.
            const errStr = String(e)
            if (errStr.includes("Proxy is not running")) {
                setError("Proxy is not running")
                setConnections([])
                setTotalSpeed({ up: 0, down: 0 })
            } else {
                console.error("Failed to fetch connections", e)
                // Don't wipe connections immediately to prevent flickering
            }
            setIsLoading(false)
        }
    }

    useEffect(() => {
        // Initial fetch
        fetchConnections()

        // Polling interval
        const interval = setInterval(fetchConnections, 2000)
        return () => clearInterval(interval)
    }, [])

    const handleCloseConnection = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await invoke("close_connection", { id })
            toast.success(t('connections.toast.closed'))
            // Optimistic update
            setConnections(prev => prev.filter(c => c.id !== id))
        } catch (e: any) {
            toast.error(t('connections.toast.close_failed', { error: String(e) }))
        }
    }

    const handleCloseAll = async () => {
        try {
            await invoke("close_all_connections")
            toast.success(t('connections.toast.closed_all'))
            setConnections([])
        } catch (e: any) {
            toast.error(t('connections.toast.close_all_failed', { error: String(e) }))
        }
    }

    const filteredConnections = useMemo(() => {
        if (!searchQuery) return connections;
        const lowerQ = searchQuery.toLowerCase();
        return connections.filter(c =>
            c.metadata.host.toLowerCase().includes(lowerQ) ||
            c.metadata.process?.toLowerCase().includes(lowerQ) ||
            c.metadata.destinationIP.includes(lowerQ) ||
            c.rulePayload.toLowerCase().includes(lowerQ)
        );
    }, [connections, searchQuery]);

    // Grouping / Formatting helper
    const getProcessName = (path?: string, name?: string) => {
        if (name) return name;
        if (path) {
            // Extract filename from path (Mac/Linux/Windows safe-ish)
            const parts = path.split(/[/\\]/);
            return parts[parts.length - 1];
        }
        return "Unknown";
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className={cn(
                "border-b border-black/2 dark:border-white/2 bg-transparent p-5 md:px-8 md:pb-6 shrink-0 relative z-20",
                isMac ? "md:pt-8" : "md:pt-8"
            )}>
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full relative z-10 pointer-events-none">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-1 tracking-tight">{t('connections.title', 'Connections')}</h2>
                            <div className="flex items-center gap-3 text-xs md:text-sm text-text-secondary font-medium">
                                <div className="flex items-center gap-1.5" title={t('connections.total_download', 'Total Download')}>
                                    <ArrowDown size={14} className="text-accent-green" />
                                    <span>{formatBytes(totalSpeed.down)}</span>
                                </div>
                                <div className="h-3 w-px bg-border-color" />
                                <div className="flex items-center gap-1.5" title={t('connections.total_upload', 'Total Upload')}>
                                    <ArrowUp size={14} className="text-primary" />
                                    <span>{formatBytes(totalSpeed.up)}</span>
                                </div>
                                <div className="h-3 w-px bg-border-color" />
                                <span>{filteredConnections.length} / {connections.length} {t('connections.label', 'Active')}</span>
                            </div>
                        </div>

                        <div className="flex gap-2 pointer-events-auto">
                            <button
                                onClick={handleCloseAll}
                                disabled={connections.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-xs font-bold transition-all border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Unplug size={16} />
                                {t('connections.close_all', 'Close All')}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pointer-events-auto">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-text-primary transition-colors" size={16} />
                            <input
                                placeholder={t('connections.search_placeholder', 'Search process, host, IP...')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-primary focus:outline-none transition-all font-medium placeholder:text-text-tertiary"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 sidebar-scroll bg-transparent" ref={scrollRef}>
                <div className="max-w-5xl mx-auto w-full space-y-2 pb-20">
                    {error ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <AlertCircle size={40} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    ) : (filteredConnections.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Activity size={40} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium">{searchQuery ? t('connections.no_results', 'No matching connections') : t('connections.empty', 'No active connections')}</p>
                        </div>
                    ) : (
                        filteredConnections.map(conn => (
                            <div
                                key={conn.id}
                                className="glass-card flex items-center justify-between p-3 md:p-4 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 border border-transparent hover:border-border-color group"
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="size-10 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0 text-text-tertiary">
                                        {conn.metadata.process ? (
                                            <Monitor size={20} className="text-primary" />
                                        ) : (
                                            <Globe size={20} />
                                        )}
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-text-primary truncate max-w-[200px] md:max-w-[300px]" title={conn.metadata.host || conn.metadata.destinationIP}>
                                                {conn.metadata.host || conn.metadata.destinationIP}:{conn.metadata.destinationPort}
                                            </span>
                                            {conn.metadata.process && (
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-text-secondary truncate max-w-[100px] md:max-w-none cursor-help"
                                                    title={conn.metadata.processPath || conn.metadata.process}
                                                >
                                                    {getProcessName(conn.metadata.processPath, conn.metadata.process)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] md:text-xs text-text-tertiary">
                                            <span className="flex items-center gap-1" title={t('connections.network')}><Wifi size={10} /> {conn.metadata.network}</span>
                                            <span className="truncate max-w-[120px] cursor-help" title={`${t('connections.chains')}: ${conn.chains.join(' → ')}`}>{conn.chains[0]}</span>
                                            <span className="truncate max-w-[120px] text-text-secondary cursor-help" title={`${t('connections.rule')}: ${conn.rulePayload} (${conn.rule})`}>{conn.rulePayload} ({conn.rule})</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats & Actions */}
                                <div className="flex items-center gap-4 md:gap-8 shrink-0">
                                    <div className="flex flex-col items-end min-w-[80px]">
                                        <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                            <ArrowDown size={10} /> {formatBytes(conn.download)}
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                                            <ArrowUp size={10} /> {formatBytes(conn.upload)}
                                        </div>
                                    </div>

                                    <div className="items-center gap-1 text-[10px] text-text-tertiary min-w-[60px] justify-end hidden sm:flex">
                                        <Clock size={10} />
                                        {formatDuration(conn.start)}
                                    </div>

                                    <button
                                        onClick={(e) => handleCloseConnection(conn.id, e)}
                                        className="p-2 text-text-tertiary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        title={t('connections.close', 'Close Connection')}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    ))}
                </div>
            </div>
        </div>
    )
}

"use client"

import React, { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, emit } from "@tauri-apps/api/event"
import { AppSettings, defaultSettings, getAppSettings, saveAppSettings } from "@/lib/settings"
import { Power, Settings, Globe, Shield, Zap, LayoutDashboard, Server, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"

const formatSpeed = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B/s`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
}

export default function TrayPage() {
    const { t, i18n } = useTranslation()
    const { resolvedTheme } = useTheme()
    const [settings, setSettings] = useState<AppSettings>(defaultSettings)
    const [status, setStatus] = useState<any>({ is_running: false, tun_mode: false, routing_mode: "rule" })
    const [mounted, setMounted] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [nodes, setNodes] = useState<any[]>([])
    const [ipInfo, setIpInfo] = useState<any>(null)
    const [checkingIp, setCheckingIp] = useState(false)
    const [latency, setLatency] = useState<number | null>(null)
    const [traffic, setTraffic] = useState({ up: 0, down: 0 })
    const [trafficHistory, setTrafficHistory] = useState<{ up: number, down: number }[]>(new Array(30).fill({ up: 0, down: 0 }))
    const [isQuitting, setIsQuitting] = useState(false)
    const manualActionRef = useRef(false)

    const ipInfoRef = useRef(ipInfo)

    useEffect(() => { ipInfoRef.current = ipInfo }, [ipInfo])

    useEffect(() => {
        setMounted(true)
        // Initial load
        getAppSettings().then(setSettings)
        invoke("get_proxy_status").then(setStatus)
        invoke("get_profiles").then((profiles: any) => {
            const allNodes = profiles.flatMap((p: any) => p.nodes)
            setNodes(allNodes)
        })

        // Listen for settings update
        const unlistenSettings = listen<AppSettings>("settings-update", (event) => {
            setSettings(event.payload)
            // Refresh profiles when settings change (e.g. active node might be new)
            invoke("get_profiles").then((profiles: any) => {
                const allNodes = profiles.flatMap((p: any) => p.nodes)
                setNodes(allNodes)
            })
        })

        // Listen for proxy status update
        const unlistenStatus = listen<any>("proxy-status-change", (event) => {
            if (manualActionRef.current) return;
            console.log("Tray: Proxy status updated", event.payload)
            setStatus(event.payload)

            setIsTransitioning(false) // Stop loading when status confirmed
            // Also refresh profiles on status change to be safe
            invoke("get_profiles").then((profiles: any) => {
                const allNodes = profiles.flatMap((p: any) => p.nodes)
                setNodes(allNodes)
            })
        })

        // Listen for IP updates from other windows (e.g. Dashboard)
        const unlistenIp = listen<any>("connection-details-update", (event) => {
            setIpInfo(event.payload)
        })

        // Request current connection details from other windows (e.g. Dashboard)
        emit("request-connection-details")

        // Listen for language changes from main window
        const unlistenLang = listen<string>("language-changed", (event) => {
            i18n.changeLanguage(event.payload)
        })

        // Listen for TUN mode sync from Dashboard (when proxy is stopped)
        const unlistenTun = listen<boolean>("tun-mode-updated", (event) => {
            setStatus((prev: any) => {
                if (!prev.is_running) {
                    return { ...prev, tun_mode: event.payload }
                }
                return prev
            })
        })

        return () => {
            unlistenSettings.then(f => f())
            unlistenStatus.then(f => f())
            unlistenIp.then(f => f())
            unlistenLang.then(f => f())
            unlistenTun.then(f => f())
        }
    }, [])

    // Fetch IP Info when running or node changes
    useEffect(() => {
        if (status.is_running) {
            setCheckingIp(true)
            // Large delay to allow Dashboard to probe first and sync results
            // This satisfies "no need for separate probe" if Dashboard is open
            const timer = setTimeout(() => {
                // If we already received IP info from another window (Dashboard), skip our own probe
                if (ipInfoRef.current) {
                    setCheckingIp(false)
                    return
                }

                invoke("check_ip")
                    .then((info: any) => {
                        const details = {
                            ip: info.query,
                            country: info.country,
                            countryCode: info.countryCode.toLowerCase(),
                            isp: info.isp
                        }
                        setIpInfo(details)
                        emit("connection-details-update", details)
                    })
                    .catch((e) => {
                        console.error("Failed to check IP", e)
                    })
                    .finally(() => {
                        setCheckingIp(false)
                    })
            }, 500)
            return () => clearTimeout(timer)
        } else {
            setIpInfo(null)
            setCheckingIp(false)
        }
    }, [status.is_running, settings.active_target_id, status.tun_mode, settings.system_proxy])

    // Determine active node:
    // 1. Try finding by ID from full list (Best for display details if list is fresh)
    // 2. Fallback to status.node (Reliable if running/last used, but might be missing if cold start)
    // 3. Fallback to first node
    const activeNode = nodes.find(n => n.id === settings.active_target_id) || status.node || nodes[0]

    // Check latency for active node
    const checkLatency = useCallback(() => {
        const nodeId = activeNode?.id
        if (!nodeId) {
            setLatency(null)
            return
        }

        // Reset latency when switching nodes or re-testing
        setLatency(null)

        invoke<number>("url_test", { nodeId })
            .then(lat => setLatency(lat))
            .catch(e => console.error("Latency test failed", e))
    }, [activeNode])

    useEffect(() => {
        checkLatency()
    }, [checkLatency])

    // Traffic Monitor WebSocket
    useEffect(() => {
        if (!status.is_running || !status.clash_api_port) {
            setTraffic({ up: 0, down: 0 })
            setTrafficHistory(new Array(30).fill({ up: 0, down: 0 }))
            return
        }

        let ws: WebSocket | null = null
        let retryTimeout: NodeJS.Timeout

        const connect = () => {
            ws = new WebSocket(`ws://127.0.0.1:${status.clash_api_port}/traffic`)

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    const total = data.up + data.down
                    setTraffic({ up: data.up, down: data.down })
                    setTrafficHistory(prev => {
                        const next = [...prev, { up: data.up, down: data.down }]
                        if (next.length > 30) next.shift()
                        return next
                    })
                } catch (e) {
                    // ignore
                }
            }

            ws.onerror = () => {
                ws?.close()
            }

            ws.onclose = () => {
                // Simple retry logic
                retryTimeout = setTimeout(connect, 2000)
            }
        }

        // Delay connection slightly to allow core start
        setTimeout(connect, 1000)

        return () => {
            clearTimeout(retryTimeout)
            ws?.close()
        }
    }, [status.is_running, status.clash_api_port])

    const toggleConnection = async () => {
        if (isTransitioning) return
        manualActionRef.current = true
        setIsTransitioning(true)


        try {
            if (status.is_running) {
                await invoke("stop_proxy")
            } else {
                // Determine which node to connect to
                const nodeId = settings.active_target_id
                const node = nodes.find(n => n.id === nodeId) || nodes[0]

                if (!node) {
                    // Fallback: if no nodes available, we can't start
                    setIsTransitioning(false)
                    invoke("open_main_window")
                    return
                }

                await invoke("start_proxy", {
                    node,
                    tun: status.tun_mode,
                    routing: status.routing_mode
                })
            }
        } catch (e) {
            console.error("Tray: Operation failed", e)
        } finally {
            setIsTransitioning(false)
            setTimeout(() => { manualActionRef.current = false }, 1000)
        }
    }



    const setMode = async (mode: "rule" | "global" | "direct") => {
        if (isTransitioning) return
        setIsTransitioning(true)
        try {
            await invoke("set_routing_mode_command", { mode })
        } catch (e) {
            setIsTransitioning(false)
        }
    }

    const toggleSystemProxy = async () => {
        const newSettings = { ...settings, system_proxy: !settings.system_proxy }
        setSettings(newSettings)
        try {
            await saveAppSettings(newSettings)
        } catch (e) {
            setSettings(settings)
        }
    }

    const toggleTunMode = async () => {
        if (isTransitioning) return
        manualActionRef.current = true
        setIsTransitioning(true)


        const newTunMode = !status.tun_mode
        try {
            if (status.is_running) {
                // If running, restart with new mode
                const activeNode = nodes.find(n => n.id === settings.active_target_id) || nodes[0]
                await invoke("start_proxy", {
                    node: activeNode,
                    tun: newTunMode,
                    routing: status.routing_mode
                })
            } else {
                // Just update local status state so next start uses it
                setStatus({ ...status, tun_mode: newTunMode })
                // Emit sync event for Dashboard (when stopped)
                emit("tun-mode-updated", newTunMode)
                setIsTransitioning(false)
            }
        } catch (e) {
            console.error("Tun toggle failed", e)
        } finally {

            setIsTransitioning(false)
            setTimeout(() => { manualActionRef.current = false }, 1000)
        }
    }


    const handleQuit = useCallback(async () => {
        if (isQuitting) return
        setIsQuitting(true)
        try {
            await invoke("quit_app")
        } catch (e) {
            console.error("Quit failed", e)
            setIsQuitting(false)
        }
    }, [isQuitting])



    const isDark = mounted && resolvedTheme === "dark"

    if (!mounted) return null

    return (
        <div className="h-screen w-full flex flex-col select-none transition-colors duration-300 bg-transparent text-text-primary">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-white/[0.03] dark:border-white/[0.03] bg-black/5 dark:bg-white/5">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "size-2 rounded-full transition-colors",
                        isTransitioning ? "bg-blue-400 animate-pulse" : (status.is_running ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-yellow-500")
                    )} />
                    <span className="text-xs font-bold tracking-wider opacity-80 uppercase">
                        {isTransitioning ? t('tray.processing') : (status.is_running ? `${t('tray.on')} (${status.tun_mode ? t('tray.mode_short.tun') : (settings.system_proxy ? t('tray.mode_short.system') : t('tray.mode_short.port'))})` : t('tray.off'))}
                    </span>
                </div>
                <button
                    onClick={() => invoke("open_main_window")}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all hover:bg-black/5 dark:hover:bg-white/10 text-text-secondary hover:text-text-primary active:scale-95"
                >
                    <LayoutDashboard size={14} />
                    <span className="text-[11px] font-medium">{t('tray.dashboard')}</span>
                </button>
            </div>

            {/* Main Control */}
            <div className="p-4 flex flex-col gap-5">
                <button
                    onClick={toggleConnection}
                    disabled={isTransitioning}
                    className={cn(
                        "group relative h-20 w-full rounded-[32px] flex items-center px-6 gap-5 transition-all duration-500 border",
                        isTransitioning ? "opacity-90 cursor-wait bg-black/5 dark:bg-white/5 border-transparent" :
                            (status.is_running
                                ? "bg-primary/10 border-primary/30 shadow-[0_12px_32px_-12px_rgba(0,122,255,0.3)]"
                                : "glass-card hover:bg-white/5 border-white/[0.03]")
                    )}
                >
                    <div className={cn(
                        "size-14 rounded-[22px] flex items-center justify-center transition-all duration-500 shadow-lg",
                        status.is_running && !isTransitioning
                            ? "bg-primary text-white shadow-primary/20 scale-105"
                            : "bg-black/10 dark:bg-white/5 text-text-secondary group-hover:bg-black/20 dark:group-hover:bg-white/10"
                    )}>
                        <Power size={24} className={cn(
                            "transition-all duration-500",
                            status.is_running && !isTransitioning ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : "",
                            isTransitioning && "animate-spin text-primary"
                        )} />
                    </div>
                    <div className="flex flex-col items-start gap-1">
                        <span className={cn(
                            "text-lg font-bold tracking-tight transition-colors duration-500",
                            (status.is_running && !isTransitioning) ? "text-text-primary" : "text-text-secondary"
                        )}>
                            {isTransitioning
                                ? (status.is_running ? t('tray.stopping') : t('tray.connecting'))
                                : (status.tun_mode
                                    ? t('tray.mode.tun')
                                    : (settings.system_proxy ? t('tray.mode.system') : t('tray.mode.port')))}
                        </span>
                        <span className={cn(
                            "text-xs transition-colors duration-500",
                            (status.is_running && !isTransitioning) ? "text-primary/80 font-medium" : "text-text-tertiary"
                        )}>
                            {isTransitioning
                                ? t('tray.wait')
                                : (status.is_running
                                    ? (status.tun_mode ? t('tray.desc.global') : (settings.system_proxy ? t('tray.desc.system') : t('tray.desc.port', { port: settings.mixed_port })))
                                    : t('tray.click_to_connect'))}
                        </span>
                    </div>

                    {status.is_running && !isTransitioning && (
                        <div className="absolute right-6 top-1/2 -translate-y-1/2">
                            <div className="size-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(0,122,255,0.8)]" />
                        </div>
                    )}
                </button>

                {/* Status & Actions Container */}
                <div className="flex flex-col gap-3">
                    {/* Routing Modes */}
                    <div className={cn(
                        "flex gap-2",
                        isTransitioning && "opacity-50 pointer-events-none"
                    )}>
                        {[
                            { id: "global", label: t('tray.routing.global'), icon: Globe },
                            { id: "rule", label: t('tray.routing.rule'), icon: Shield },
                            { id: "direct", label: t('tray.routing.direct'), icon: Zap }
                        ].map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => setMode(mode.id as any)}
                                disabled={isTransitioning}
                                className={cn(
                                    "flex-1 relative flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl transition-all border",
                                    status.routing_mode === mode.id
                                        ? "bg-primary/5 border-primary/20 text-text-primary shadow-sm"
                                        : "bg-black/5 dark:bg-white/5 border-transparent text-text-secondary hover:text-text-primary hover:bg-black/10 dark:hover:bg-white/10"
                                )}
                            >
                                <mode.icon size={13} className={cn(
                                    "transition-colors",
                                    status.routing_mode === mode.id ? "text-primary drop-shadow-[0_0_5px_rgba(0,122,255,0.4)]" : "text-text-secondary"
                                )} />
                                <span className="text-[10px] font-bold tracking-tight">{mode.label}</span>

                                {status.routing_mode === mode.id && (
                                    <div className="absolute top-2 right-2 size-1 bg-primary rounded-full shadow-[0_0_5px_rgba(0,122,255,1)]" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Proxy Mode Toggles */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={toggleSystemProxy}
                            className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-2xl transition-all border",
                                settings.system_proxy
                                    ? "bg-primary/5 border-primary/20 text-text-primary"
                                    : "bg-black/5 dark:bg-white/5 border-transparent text-text-secondary"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Server size={12} className={settings.system_proxy ? "text-primary" : "text-text-secondary"} />
                                <span className="text-[10px] font-bold">{t('tray.system_proxy')}</span>
                            </div>
                            <div className={cn(
                                "size-1.5 rounded-full transition-all",
                                settings.system_proxy ? "bg-primary shadow-[0_0_8px_rgba(0,122,255,0.8)]" : "bg-text-tertiary"
                            )} />
                        </button>
                        <button
                            onClick={toggleTunMode}
                            disabled={isTransitioning}
                            className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-2xl transition-all border",
                                status.tun_mode
                                    ? "bg-primary/5 border-primary/20 text-text-primary"
                                    : "bg-black/5 dark:bg-white/5 border-transparent text-text-secondary"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Zap size={12} className={status.tun_mode ? "text-primary" : "text-text-secondary"} />
                                <span className="text-[10px] font-bold">{t('tray.tun_mode')}</span>
                            </div>
                            <div className={cn(
                                "size-1.5 rounded-full transition-all",
                                status.tun_mode ? "bg-primary shadow-[0_0_8px_rgba(0,122,255,0.8)]" : "bg-text-tertiary"
                            )} />
                        </button>
                    </div>

                    {/* Active Node Info */}
                    {/* Active Node Info */}
                    {activeNode && (
                        <div className="px-1 pt-3 pb-1 flex flex-col gap-2 border-t border-white/[0.03]">
                            {/* Row 1: Node Name & Latency */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5 max-w-[70%]">
                                    <div className="size-6 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
                                        <Globe size={13} />
                                    </div>
                                    <span className="text-xs font-medium truncate text-text-primary">
                                        {activeNode.name}
                                    </span>
                                </div>
                                <button
                                    onClick={checkLatency}
                                    className={cn(
                                        "text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 transition-all hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 cursor-pointer shrink-0",
                                        latency
                                            ? (latency < 100 ? "text-green-500" : latency < 300 ? "text-yellow-500" : "text-red-500")
                                            : "text-text-tertiary"
                                    )}
                                    title="Click to re-test latency"
                                >
                                    {latency ? `${latency}ms` : "..."}
                                </button>
                            </div>

                            {/* Row 2: IP Info */}
                            {(status.is_running) && (
                                <div className="flex items-center gap-2 pl-[34px] text-[11px] text-text-secondary">
                                    {checkingIp ? (
                                        <span className="animate-pulse opacity-70">{t('tray.id_active.check_ip')}</span>
                                    ) : ipInfo ? (
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="font-mono">{ipInfo.ip}</span>
                                            <span className="w-px h-2.5 bg-text-tertiary/30 shrink-0" />
                                            <span className="shrink-0">{ipInfo.countryCode}</span>
                                            {ipInfo.isp && (
                                                <>
                                                    <span className="w-px h-2.5 bg-text-tertiary/30 shrink-0" />
                                                    <span className="truncate opacity-80" title={ipInfo.isp}>{ipInfo.isp}</span>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="opacity-50">{t('tray.id_active.waiting')}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Traffic Monitor */}
                    {status.is_running && (
                        <div className="px-1 pt-2 border-t border-white/[0.03] flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-emerald-500">↑ {formatSpeed(traffic.up)}</span>
                                <span className="text-primary">↓ {formatSpeed(traffic.down)}</span>
                            </div>
                            <div className="h-8 flex items-end gap-[1px] opacity-80">
                                {trafficHistory.map((val, i) => {
                                    const maxTotal = Math.max(...trafficHistory.map(t => t.up + t.down), 1024)
                                    const total = val.up + val.down
                                    const totalHeight = Math.min((total / maxTotal) * 100, 100)

                                    const upRatio = total > 0 ? val.up / total : 0
                                    const downRatio = total > 0 ? val.down / total : 0

                                    return (
                                        <div
                                            key={i}
                                            className="flex-1 flex flex-col justify-end bg-black/5 dark:bg-white/5 rounded-t-[1px] overflow-hidden relative"
                                            style={{ height: `${Math.max(totalHeight, 1)}%` }}
                                        >
                                            {/* Stacked Bars: Up (Green) top, Down (Blue) bottom */}
                                            <div
                                                className="w-full bg-emerald-500 transition-all duration-300"
                                                style={{ height: `${upRatio * 100}%` }}
                                            />
                                            <div
                                                className="w-full bg-primary transition-all duration-300"
                                                style={{ height: `${downRatio * 100}%` }}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-auto px-4 py-3 border-t border-white/[0.03] flex items-center justify-between bg-black/5 dark:bg-white/5">
                <span className="text-[10px] font-mono opacity-20 whitespace-nowrap overflow-hidden max-w-[80px]">V0.1.0</span>
                <button
                    onClick={handleQuit}
                    disabled={isQuitting}
                    className={cn(
                        "text-[10px] font-bold tracking-widest px-4 py-1.5 rounded-xl transition-all shadow-lg shadow-red-500/20 border border-red-500/20",
                        isQuitting
                            ? "bg-red-500 text-white opacity-80 cursor-wait min-w-[60px] flex justify-center"
                            : "bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 active:scale-95"
                    )}
                >
                    {isQuitting ? <Loader2 size={12} className="animate-spin" /> : t('tray.exit')}
                </button>
            </div>
        </div >
    )
}

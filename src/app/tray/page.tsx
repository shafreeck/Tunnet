"use client"

import React, { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { AppSettings, defaultSettings, getAppSettings, saveAppSettings } from "@/lib/settings"
import { Power, Settings, MoreHorizontal, Globe, Shield, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"

export default function TrayPage() {
    const { resolvedTheme } = useTheme()
    const [settings, setSettings] = useState<AppSettings>(defaultSettings)
    const [status, setStatus] = useState<any>({ is_running: false, tun_mode: false, routing_mode: "rule" })
    const [mounted, setMounted] = useState(false)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [nodes, setNodes] = useState<any[]>([])

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
        })

        // Listen for proxy status update
        const unlistenStatus = listen<any>("proxy-status-change", (event) => {
            console.log("Tray: Proxy status updated", event.payload)
            setStatus(event.payload)
            setIsTransitioning(false) // Stop loading when status confirmed
        })

        return () => {
            unlistenSettings.then(f => f())
            unlistenStatus.then(f => f())
        }
    }, [])

    const toggleConnection = async () => {
        if (isTransitioning) return
        setIsTransitioning(true)

        try {
            if (status.is_running) {
                await invoke("stop_proxy")
            } else {
                // Determine which node to connect to
                const nodeId = settings.active_node_id
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
            setIsTransitioning(false)
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

    const isDark = mounted && resolvedTheme === "dark"

    if (!mounted) return null

    return (
        <div className="h-screen w-full flex flex-col select-none transition-colors duration-300 bg-transparent text-text-primary">
            {/* Header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-white/[0.03] dark:border-white/[0.03] bg-black/5 dark:bg-white/5">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "size-2 rounded-full transition-colors",
                        isTransitioning ? "bg-blue-400 animate-pulse" : (status.is_running ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-yellow-500")
                    )} />
                    <span className="text-xs font-bold tracking-wider opacity-80 uppercase">
                        {isTransitioning ? "Processing..." : (status.is_running ? `TUNNET ON (${status.tun_mode ? 'TUN' : 'System'})` : "TUNNET OFF")}
                    </span>
                </div>
                <button
                    onClick={() => invoke("open_main_window")}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 text-text-secondary hover:text-text-primary"
                >
                    <Settings size={14} />
                </button>
            </div>

            {/* Main Control */}
            <div className="p-4 flex flex-col gap-4">
                <button
                    onClick={toggleConnection}
                    disabled={isTransitioning}
                    className={cn(
                        "group relative h-20 w-full rounded-2xl flex items-center px-4 gap-4 transition-all duration-300",
                        isTransitioning ? "opacity-90 cursor-wait bg-black/5 dark:bg-white/5" :
                            (status.is_running
                                ? "bg-primary border border-white/10 shadow-lg"
                                : "glass-card hover:bg-white/10")
                    )}
                >
                    <div className={cn(
                        "size-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm",
                        status.is_running && !isTransitioning ? "bg-white text-primary" : "bg-white/10 text-white/50"
                    )}>
                        <Power size={20} className={cn(
                            status.is_running && !isTransitioning && "drop-shadow-sm",
                            isTransitioning && "animate-spin text-primary"
                        )} />
                    </div>
                    <div className="flex flex-col items-start gap-1">
                        <span className={cn("text-sm font-bold", (status.is_running && !isTransitioning) ? "text-white" : "text-text-primary")}>
                            {isTransitioning ? (status.is_running ? "Stopping..." : "Connecting...") : (status.tun_mode ? "TUN Proxy" : "System Proxy")}
                        </span>
                        <span className={cn("text-[10px]", (status.is_running && !isTransitioning) ? "text-white/80" : "text-text-secondary")}>
                            {isTransitioning ? "Please wait a moment" : (status.is_running ? "Traffic is being routed" : "Click to connect")}
                        </span>
                    </div>

                    {/* Status Orb Animation if active */}
                    {status.is_running && !isTransitioning && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="size-2 bg-white rounded-full animate-ping opacity-75" />
                        </div>
                    )}
                </button>

                {/* Routing Modes */}
                <div className={cn(
                    "bg-black/10 dark:bg-white/5 rounded-2xl p-1 flex gap-1 border border-border-color",
                    isTransitioning && "opacity-50 pointer-events-none"
                )}>
                    {[
                        { id: "global", label: "Global", icon: Globe },
                        { id: "rule", label: "Rule", icon: Shield },
                        { id: "direct", label: "Direct", icon: Zap }
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setMode(mode.id as any)}
                            disabled={isTransitioning}
                            className={cn(
                                "flex-1 py-2 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all",
                                status.routing_mode === mode.id
                                    ? "bg-primary text-white shadow-sm"
                                    : "text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            <mode.icon size={14} />
                            {mode.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Footer / Quick Actions */}
            <div className="mt-auto p-4 border-t border-border-color flex items-center justify-between bg-black/5 dark:bg-white/5">
                <span className="text-[10px] font-mono opacity-40">v0.1.0</span>
                <button
                    onClick={() => invoke("quit_app")}
                    className="text-[10px] font-bold px-2 py-1 rounded transition-colors text-text-secondary hover:text-red-500 hover:bg-red-500/10"
                >
                    QUIT
                </button>
            </div>
        </div>
    )
}

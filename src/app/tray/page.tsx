"use client"

import React, { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { AppSettings, defaultSettings, getAppSettings, saveAppSettings } from "@/lib/settings"
import { Power, Settings, MoreHorizontal, Globe, Shield, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

export default function TrayPage() {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isProxyRunning, setIsProxyRunning] = useState(false)

    useEffect(() => {
        // Initial load
        getAppSettings().then(setSettings)

        // Listen for updates
        const unlisten = listen<AppSettings>("settings-update", (event) => {
            setSettings(event.payload)
        })

        return () => {
            unlisten.then(f => f())
        }
    }, [])

    const toggleSystemProxy = async () => {
        const newVal = !settings.system_proxy
        setSettings({ ...settings, system_proxy: newVal })
        await saveAppSettings({ ...settings, system_proxy: newVal })
    }

    const setMode = async (mode: "rule" | "global" | "direct") => {
        await invoke("set_routing_mode_command", { mode })
    }

    return (
        <div className="h-screen w-full bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden flex flex-col text-white select-none">
            {/* Header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                    <div className={cn("size-2 rounded-full", settings.system_proxy ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-yellow-500")} />
                    <span className="text-xs font-bold tracking-wider text-white/80">
                        {settings.system_proxy ? "TUNNET ON" : "TUNNET OFF"}
                    </span>
                </div>
                <button
                    onClick={() => invoke("open_main_window")}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
                >
                    <Settings size={14} />
                </button>
            </div>

            {/* Main Control */}
            <div className="p-4 flex flex-col gap-4">
                <button
                    onClick={toggleSystemProxy}
                    className={cn(
                        "group relative h-20 w-full rounded-2xl flex items-center px-4 gap-4 transition-all duration-300",
                        settings.system_proxy
                            ? "bg-gradient-to-br from-primary/80 to-primary/40 border border-primary/50 shadow-lg shadow-primary/20"
                            : "bg-white/5 border border-white/10 hover:bg-white/10"
                    )}
                >
                    <div className={cn(
                        "size-10 rounded-xl flex items-center justify-center transition-all duration-300",
                        settings.system_proxy ? "bg-white text-primary" : "bg-white/10 text-white/50"
                    )}>
                        <Power size={20} className={cn(settings.system_proxy && "drop-shadow-sm")} />
                    </div>
                    <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-bold">System Proxy</span>
                        <span className="text-[10px] text-white/60">
                            {settings.system_proxy ? "Traffic is being routed" : "Direct connection"}
                        </span>
                    </div>

                    {/* Status Orb Animation if active */}
                    {settings.system_proxy && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="size-2 bg-white rounded-full animate-ping opacity-75" />
                        </div>
                    )}
                </button>

                {/* Routing Modes */}
                <div className="bg-white/5 rounded-2xl p-1 flex gap-1 border border-white/10">
                    {[
                        { id: "rule", label: "Rule", icon: Shield },
                        { id: "global", label: "Global", icon: Globe },
                        { id: "direct", label: "Direct", icon: Zap }
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => setMode(mode.id as any)}
                            className={cn(
                                "flex-1 py-2 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all",
                                "hover:bg-white/5 text-white/60 hover:text-white"
                            )}
                        >
                            <mode.icon size={14} />
                            {mode.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Footer / Quick Actions */}
            <div className="mt-auto p-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-white/40 font-mono">v0.1.0</span>
                <button
                    onClick={() => invoke("quit_app")}
                    className="text-[10px] text-white/40 hover:text-red-400 font-bold px-2 py-1 hover:bg-white/5 rounded transition-colors"
                >
                    QUIT
                </button>
            </div>
        </div>
    )
}

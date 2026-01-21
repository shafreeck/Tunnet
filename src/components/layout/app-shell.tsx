"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

import { toast } from "sonner"

export function AppShell({ children }: { children: React.ReactNode }) {
    const [exitPhase, setExitPhase] = useState<"idle" | "shrinking" | "final">("idle")

    useEffect(() => {
        let unlisten: (() => void) | undefined

        const setupListener = async () => {
            unlisten = await listen("ui:initiate-exit", async () => {
                // 1. Phase 1: Slow shrink to a glowing phosphor line (1.0s)
                setExitPhase("shrinking")
                toast.dismiss()

                // Start cleanup immediately in background
                invoke("quit_app").catch(e => console.error("Cleanup failed:", e))

                // After precisely 1s (matching CSS), proceed to Phase 2
                setTimeout(() => {
                    // 2. Phase 2: Rapid snap to center point and vanish (0.4s)
                    setExitPhase("final")

                    // 3. Let Phase 2 animation finish before killing process
                    setTimeout(() => {
                        invoke("final_exit").catch(() => { })
                    }, 400)
                }, 1000)
            })
        }

        setupListener()

        return () => {
            if (unlisten) unlisten()
        }
    }, [])

    return (
        <div
            className={cn(
                "app-window",
                exitPhase === "idle" && "transition-all duration-300",
                exitPhase === "shrinking" && "exiting-phase-shrink",
                exitPhase === "final" && "exiting-phase-final"
            )}
            data-tauri-drag-region
        >
            {children}
            {exitPhase !== "idle" && (
                <div className="absolute inset-0 bg-white opacity-0 z-2147483647 pointer-events-none animate-crt-overlay" />
            )}
        </div>
    )
}

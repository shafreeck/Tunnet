"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

export function AppShell({ children }: { children: React.ReactNode }) {
    const [isExiting, setIsExiting] = useState(false)

    useEffect(() => {
        let unlisten: (() => void) | undefined

        const setupListener = async () => {
            unlisten = await listen("ui:initiate-exit", () => {
                setIsExiting(true)
                // Wait for animation to finish before quitting
                setTimeout(async () => {
                    try {
                        await invoke("quit_app")
                    } catch (e) {
                        console.error("Failed to quit app", e)
                        // If quit failed, maybe reset state? But user wanted to quit.
                        // Force close webview window as fallback?
                        // For now, simple error log.
                    }
                }, 500) // Match duration in CSS
            })
        }

        setupListener()

        return () => {
            if (unlisten) unlisten()
        }
    }, [])

    return (
        <div
            className={cn("app-window transition-all duration-300", isExiting && "animate-exit-app")}
            data-tauri-drag-region
        >
            {children}
        </div>
    )
}

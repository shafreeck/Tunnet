"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

import { toast } from "sonner"

export function AppShell({ children }: { children: React.ReactNode }) {
    const [isExiting, setIsExiting] = useState(false)

    useEffect(() => {
        let unlisten: (() => void) | undefined

        const setupListener = async () => {
            unlisten = await listen("ui:initiate-exit", () => {
                setIsExiting(true)
                // Dismiss all toasts immediately so they don't hang during animation
                toast.dismiss()

                // Trigger backend quit immediately. 
                // The backend will handle waiting for the animation (Option B).
                invoke("quit_app").catch((e) => {
                    console.error("Failed to quit app", e)
                })
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

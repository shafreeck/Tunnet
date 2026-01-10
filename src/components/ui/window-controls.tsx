"use client"

import { useEffect, useState } from "react"
import { type as getType } from "@tauri-apps/plugin-os"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Minus, Square, X, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

export function WindowControls({ className }: { className?: string }) {
    const [osType, setOsType] = useState<string | null>(null)
    const [isMaximized, setIsMaximized] = useState(false)
    const [isHovering, setIsHovering] = useState(false)

    useEffect(() => {
        const init = async () => {
            try {
                const type = await getType()
                setOsType(type)
            } catch (error) {
                console.error("Failed to detect OS:", error)
            }
        }
        init()
    }, [])

    useEffect(() => {
        const checkMaximized = async () => {
            try {
                const win = getCurrentWindow()
                setIsMaximized(await win.isMaximized())
            } catch (e) { }
        }
        checkMaximized()

        // Optional: Add resize listener if needed
    }, [osType])

    // Detect if we should render controls
    if (!osType || osType === "android" || osType === "ios") {
        return null
    }

    const handleMinimize = () => getCurrentWindow().minimize()
    const handleMaximize = async () => {
        const win = getCurrentWindow()
        const maximized = await win.isMaximized()
        if (maximized) {
            await win.unmaximize()
            setIsMaximized(false)
        } else {
            await win.maximize()
            setIsMaximized(true)
        }
    }
    const handleClose = () => getCurrentWindow().close()

    if (osType === "macos") {
        return (
            <div
                className={cn("fixed top-6 left-6 z-50 flex gap-2 group", className)}
                data-tauri-drag-region
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                <button
                    onClick={handleClose}
                    className="size-3 rounded-full bg-[#FF5F56] border border-[#E0443E] flex items-center justify-center overflow-hidden hover:brightness-90 active:brightness-75 transition-all"
                >
                    <X size={8} className={cn("text-black/50 opacity-0 transition-opacity", isHovering && "opacity-100")} strokeWidth={3} />
                </button>
                <button
                    onClick={handleMinimize}
                    className="size-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] flex items-center justify-center overflow-hidden hover:brightness-90 active:brightness-75 transition-all"
                >
                    <Minus size={8} className={cn("text-black/50 opacity-0 transition-opacity", isHovering && "opacity-100")} strokeWidth={3} />
                </button>
                <button
                    onClick={handleMaximize}
                    className="size-3 rounded-full bg-[#27C93F] border border-[#1AAB29] flex items-center justify-center overflow-hidden hover:brightness-90 active:brightness-75 transition-all"
                >
                    {isMaximized ? (
                        <Copy size={6} className={cn("text-black/50 opacity-0 transition-opacity rotate-180", isHovering && "opacity-100")} strokeWidth={3} />
                    ) : (
                        <div className={cn("size-2 bg-black/50 opacity-0 transition-opacity", isHovering && "opacity-100")} style={{ clipPath: "polygon(0% 40%, 40% 40%, 40% 0%, 60% 0%, 60% 40%, 100% 40%, 100% 60%, 60% 60%, 60% 100%, 40% 100%, 40% 60%, 0% 60%)" }} />
                    )}
                </button>
            </div>
        )
    }

    if (osType === "linux") {
        return (
            <div className={cn("fixed top-4 right-4 z-50 flex gap-3", className)} data-tauri-drag-region>
                <button
                    onClick={handleMinimize}
                    className="size-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 flex items-center justify-center transition-colors text-foreground"
                >
                    <Minus size={14} />
                </button>
                <button
                    onClick={handleMaximize}
                    className="size-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 flex items-center justify-center transition-colors text-foreground"
                >
                    {isMaximized ? (
                        <Copy size={12} className="rotate-180" />
                    ) : (
                        <Square size={12} />
                    )}
                </button>
                <button
                    onClick={handleClose}
                    className="size-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-[#E95420] hover:text-white flex items-center justify-center transition-colors group text-foreground"
                >
                    <X size={14} />
                </button>
            </div>
        )
    }

    // Windows Controls
    return (
        <div className={cn("fixed top-0 right-0 z-50 flex h-8 bg-transparent transition-colors", className)} data-tauri-drag-region>
            <div
                className="flex items-center justify-center w-10 h-8 hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/20 transition-colors cursor-default"
                onClick={handleMinimize}
            >
                <Minus size={14} className="opacity-50 hover:opacity-100" />
            </div>
            <div
                className="flex items-center justify-center w-10 h-8 hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/20 transition-colors cursor-default"
                onClick={handleMaximize}
            >
                {isMaximized ? (
                    <Copy size={12} className="rotate-180 opacity-50 hover:opacity-100" />
                ) : (
                    <Square size={12} className="opacity-50 hover:opacity-100" />
                )}
            </div>
            <div
                className={cn(
                    "flex items-center justify-center w-10 h-8 hover:bg-[#E81123] active:bg-[#B30D1B] group transition-all cursor-default",
                    !isMaximized && "rounded-tr-[24px]"
                )}
                onClick={handleClose}
            >
                <X size={14} className="opacity-50 group-hover:opacity-100 group-hover:text-white" />
            </div>
        </div>
    )
}

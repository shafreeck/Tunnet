"use client"

import { useRef, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"


interface LogViewerProps {
    logs: string[]
    onClear: () => void
    filter?: string
    autoScroll?: boolean
    className?: string
}

export function LogViewer({ logs, onClear, filter = "", autoScroll = true, className }: LogViewerProps) {
    const scrollRef = useRef<HTMLDivElement>(null)

    // Scroll to bottom effect
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [logs, autoScroll, filter])

    const filteredLogs = useMemo(() => {
        if (!filter) return logs
        const lowerFilter = filter.toLowerCase()
        return logs.filter(log => log.toLowerCase().includes(lowerFilter))
    }, [logs, filter])

    return (
        <div className={cn("flex flex-col bg-card-bg rounded-xl border border-border-color overflow-hidden backdrop-blur-md", className)}>
            {/* Log Content */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-x-auto overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-0.5 scrollbar-thin"
            >
                {filteredLogs.length === 0 ? (
                    <div className="text-text-tertiary italic text-center mt-4 opacity-50">No logs to display</div>
                ) : (
                    filteredLogs.map((log, index) => (
                        <LogLine key={index} content={log} />
                    ))
                )}
            </div>
        </div>
    )
}

function LogLine({ content }: { content: string }) {
    // Simple colorization logic
    const lower = content.toLowerCase()
    let typeClass = "text-text-secondary"

    if (lower.includes("error") || lower.includes("fatal") || lower.includes("panic") || lower.includes("[err]")) {
        typeClass = "text-red-600 dark:text-red-400"
    } else if (lower.includes("warn")) {
        typeClass = "text-amber-600 dark:text-yellow-400"
    } else if (lower.includes("info")) {
        typeClass = "text-blue-600 dark:text-blue-300" // Soft blue for info
    } else if (lower.includes("debug")) {
        typeClass = "text-gray-500 dark:text-gray-500"
    }

    // Highlight specific keywords (optional enhancement)
    // For now, render whole line with type color

    return (
        <div className={cn("whitespace-pre-wrap break-all hover:bg-black/5 dark:hover:bg-white/5 px-1 rounded", typeClass)}>
            {content}
        </div>
    )
}

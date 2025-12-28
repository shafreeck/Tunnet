"use client"

import React, { useEffect, useRef, useState, useMemo } from "react"
import { Scroll, Trash2, Pause, Play, Search, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface LogViewerProps {
    logs: string[]
    onClear: () => void
    className?: string
}

export function LogViewer({ logs, onClear, className }: LogViewerProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [autoScroll, setAutoScroll] = useState(true)
    const [filter, setFilter] = useState("")

    // Scroll to bottom effect
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [logs, autoScroll, filter])

    const handleCopy = () => {
        const text = logs.join("\n")
        navigator.clipboard.writeText(text)
        toast.success("Logs copied to clipboard")
    }

    const filteredLogs = useMemo(() => {
        if (!filter) return logs
        const lowerFilter = filter.toLowerCase()
        return logs.filter(log => log.toLowerCase().includes(lowerFilter))
    }, [logs, filter])

    return (
        <div className={cn("flex flex-col bg-card-bg rounded-xl border border-border-color overflow-hidden backdrop-blur-md", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 bg-black/5 dark:bg-white/5 border-b border-border-color">
                <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-text-secondary uppercase tracking-wider">Logs</span>
                    <span className="bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-text-tertiary font-mono">
                        {filteredLogs.length}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative group">
                        <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 size-3 text-text-tertiary" />
                        <input
                            type="text"
                            placeholder="Filter..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
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

                    <button onClick={handleCopy} className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors" title="Copy Logs">
                        <Copy size={14} />
                    </button>

                    <button onClick={onClear} className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-text-secondary hover:text-red-500 transition-colors" title="Clear Logs">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

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

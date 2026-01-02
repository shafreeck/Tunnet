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
    // Basic ANSI parser
    const segments = parseAnsi(content)

    return (
        <div className="whitespace-pre-wrap break-all hover:bg-black/5 dark:hover:bg-white/5 px-1 rounded text-text-secondary">
            {segments.map((seg, i) => (
                <span key={i} className={seg.className}>
                    {seg.text}
                </span>
            ))}
        </div>
    )
}

interface TextSegment {
    text: string
    className?: string
}

function parseAnsi(text: string): TextSegment[] {
    const segments: TextSegment[] = []
    // Regex to match ANSI escape codes: \u001b\[[parameters]m
    const ansiRegex = /\u001b\[([0-9;]*)m/g

    let lastIndex = 0
    let match
    let currentColorClass = ""

    while ((match = ansiRegex.exec(text)) !== null) {
        // Push text before the code
        if (match.index > lastIndex) {
            segments.push({
                text: text.substring(lastIndex, match.index),
                className: currentColorClass
            })
        }

        // Parse code
        const codes = match[1].split(';').map(Number)

        for (const code of codes) {
            if (code === 0) {
                currentColorClass = "" // Reset
            } else if (code >= 30 && code <= 37) {
                // Standard Foreground
                currentColorClass = getAnsiColorClass(code)
            } else if (code >= 90 && code <= 97) {
                // Bright Foreground (Mapping to same or lighter)
                currentColorClass = getAnsiColorClass(code)
            } else if (code === 39) {
                currentColorClass = "" // Default foreground
            }
            // Ignore background codes (40-47, 100-107) and styles like bold (1) for now to keep it clean, 
            // or we could map bold to font-bold.
        }

        lastIndex = ansiRegex.lastIndex
    }

    // Push remaining text
    if (lastIndex < text.length) {
        segments.push({
            text: text.substring(lastIndex),
            className: currentColorClass
        })
    }

    return segments
}

function getAnsiColorClass(code: number): string {
    switch (code) {
        case 30: return "text-gray-500" // Black
        case 31: return "text-red-500" // Red
        case 32: return "text-green-500" // Green
        case 33: return "text-yellow-500" // Yellow
        case 34: return "text-blue-500" // Blue
        case 35: return "text-purple-500" // Magenta
        case 36: return "text-cyan-500" // Cyan
        case 37: return "text-gray-300" // White

        // Bright variants (simplified mapping)
        case 90: return "text-gray-400"
        case 91: return "text-red-400"
        case 92: return "text-green-400"
        case 93: return "text-yellow-400"
        case 94: return "text-blue-400"
        case 95: return "text-purple-400"
        case 96: return "text-cyan-400"
        case 97: return "text-white"

        default: return ""
    }
}


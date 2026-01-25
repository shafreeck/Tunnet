"use client"

import React, { useState, useEffect } from "react"

const formatSpeed = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B/s`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
}

interface TrafficMonitorProps {
    isRunning: boolean
    traffic: { up: number, down: number }
}

export function TrafficMonitor({ isRunning, traffic }: TrafficMonitorProps) {
    const [trafficHistory, setTrafficHistory] = useState<{ up: number, down: number }[]>(new Array(30).fill({ up: 0, down: 0 }))

    useEffect(() => {
        if (!isRunning) {
            setTrafficHistory(new Array(30).fill({ up: 0, down: 0 }))
            return
        }

        setTrafficHistory(prev => {
            const next = [...prev, traffic]
            if (next.length > 30) next.shift()
            return next
        })
    }, [traffic, isRunning])

    return (
        <div className="flex flex-col gap-1 w-full px-2 mt-2 mb-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between text-[11px] font-mono font-medium px-1 opacity-80">
                <span className="text-emerald-500">↑ {formatSpeed(traffic.up)}</span>
                <span className="text-primary">↓ {formatSpeed(traffic.down)}</span>
            </div>
            <div className="h-12 flex items-end gap-[3px] opacity-80">
                {trafficHistory.map((val, i) => {
                    const maxTotal = Math.max(...trafficHistory.map(t => t.up + t.down), 1024)
                    const total = val.up + val.down
                    const totalHeight = Math.min((total / maxTotal) * 100, 100)

                    const upRatio = total > 0 ? val.up / total : 0
                    const downRatio = total > 0 ? val.down / total : 0

                    return (
                        <div
                            key={i}
                            className="flex-1 flex flex-col justify-end rounded-t-sm overflow-hidden relative bg-black/5 dark:bg-white/5"
                            style={{ height: `${Math.max(totalHeight, 2)}%` }}
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
    )
}

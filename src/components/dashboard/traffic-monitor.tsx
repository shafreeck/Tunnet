"use client"

import React, { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

const formatSpeed = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B/s`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
}

interface TrafficMonitorProps {
    isRunning: boolean
    apiPort: number | null
}

export function TrafficMonitor({ isRunning, apiPort }: TrafficMonitorProps) {
    const [traffic, setTraffic] = useState({ up: 0, down: 0 })
    const [trafficHistory, setTrafficHistory] = useState<{ up: number, down: number }[]>(new Array(30).fill({ up: 0, down: 0 }))

    useEffect(() => {
        if (!isRunning || !apiPort) {
            setTraffic({ up: 0, down: 0 })
            setTrafficHistory(new Array(30).fill({ up: 0, down: 0 }))
            return
        }

        let ws: WebSocket | null = null
        let retryTimeout: NodeJS.Timeout

        const connect = () => {
            ws = new WebSocket(`ws://127.0.0.1:${apiPort}/traffic`)

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    setTraffic({ up: data.up, down: data.down })
                    setTrafficHistory(prev => {
                        const next = [...prev, { up: data.up, down: data.down }]
                        if (next.length > 30) next.shift()
                        return next
                    })
                } catch (e) {
                    // ignore
                }
            }

            ws.onerror = () => {
                ws?.close()
            }

            ws.onclose = () => {
                // Simple retry logic
                retryTimeout = setTimeout(connect, 2000)
            }
        }

        // Delay connection slightly to allow core start
        setTimeout(connect, 1000)

        return () => {
            clearTimeout(retryTimeout)
            ws?.close()
        }
    }, [isRunning, apiPort])

    // if (!isRunning) return null -- Removed to keep layout stable

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

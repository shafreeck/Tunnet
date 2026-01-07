export function getLatencyColor(latency?: number | null): string {
    if (latency === undefined || latency === null) return "text-text-tertiary"
    if (latency === 0) return "text-text-tertiary"
    if (latency < 0) return "text-red-500" // Error
    if (latency < 200) return "text-green-500" // Excellent
    if (latency <= 600) return "text-yellow-500" // Fair
    return "text-red-500" // Poor
}

export function formatLatency(latency?: number | null): string {
    if (latency === undefined || latency === null || latency === 0) return "-- ms"
    if (latency < 0) return "Timeout"
    return `${latency} ms`
}

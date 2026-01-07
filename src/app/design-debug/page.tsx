"use client"

import React from "react"
import { ServerList } from "@/components/dashboard/server-list"

// Dummy data for visual testing
const DUMMY_SERVERS: any[] = [
    {
        id: "1",
        name: "United States 01",
        provider: "Amazon AWS",
        ping: 45,
        country: "United States",
        flagUrl: "",
        type: "Active",
        status: "active"
    },
    {
        id: "2",
        name: "United States 02",
        provider: "Google Cloud",
        ping: 120,
        country: "United States",
        flagUrl: "",
        type: "Gaming",
        status: "idle"
    },
    {
        id: "3",
        name: "United States 03 (Selected)",
        provider: "DigitalOcean",
        ping: 200,
        country: "United States",
        flagUrl: "",
        type: "Netflix",
        status: "idle"
    }
]

export default function DesignDebugPage() {
    return (
        <div className="dark flex flex-col items-center justify-center min-h-screen bg-black p-10 text-white font-sans">
            <h1 className="text-2xl mb-8 text-white">Full App Context Debug</h1>

            {/* Replicating the Drawer from locations-view.tsx */}
            <div className="w-[400px] h-[600px] border border-white/10 rounded-[2.5rem] bg-white/95 dark:bg-black/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden relative">
                {/* Header simulation */}
                <div className="p-8 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
                    <span className="font-bold">Test Drawer</span>
                </div>

                {/* Content area */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <ServerList
                        servers={DUMMY_SERVERS}
                        activeServerId="1"
                        isConnected={true}
                        onSelect={() => { }}
                        onToggle={() => { }}
                        onImport={async () => { }}
                        onEdit={() => { }}
                        onDelete={() => { }}
                        showLogs={false}
                        setShowLogs={() => { }}
                        logs={{ local: [], helper: [] }}
                        onClearLogs={() => { }}
                    />
                </div>
            </div>
        </div>
    )
}

"use client"

import React, { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { LocationsView } from "./locations-view"
import { GroupsView } from "./groups-view"
import { SubscriptionsView } from "./subscriptions-view"
import { cn } from "@/lib/utils"

interface ProxiesViewProps {
    // Shared Props
    isConnected: boolean
    activeServerId: string | null
    activeAutoNodeId: string | null

    // Locations/Server Props
    servers: any[]
    onSelect: (id: string) => void
    onToggle: (id: string, restart?: boolean, shouldConnect?: boolean) => void
    onImport: (url: string, name?: string) => Promise<void>
    onEdit: (node: any) => void
    onDelete: (id: string) => void
    onRefresh: () => void
    onPing: (id: string | string[]) => Promise<void>

    // Groups Props
    // GroupsView uses allNodes too

    // Subscriptions Props
    profiles: any[]
    onUpdateSubscription: (id: string) => void
    onDeleteSubscription: (id: string) => void
    onAddSubscription: () => void
    onSelectSubscription: (id: string) => void
    onUpdateAllSubscriptions: () => void
    testingNodeIds?: string[]
    connectionState: "idle" | "connecting" | "disconnecting" | undefined
}

export function ProxiesView(props: ProxiesViewProps) {
    const { t } = useTranslation()
    const [subTab, setSubTab] = useState<"locations" | "groups" | "subscriptions">("locations")
    const [isMac, setIsMac] = useState(false)

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
    }, [])

    const tabs = [
        { id: "locations", label: t('sidebar.locations', { defaultValue: 'Locations' }) },
        { id: "groups", label: t('sidebar.groups', { defaultValue: 'Groups' }) },
        { id: "subscriptions", label: t('sidebar.subscription', { defaultValue: 'Subscriptions' }) },
    ]

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Sub-navigation Tabs */}
            <div className={cn(
                "px-4 md:px-8 pb-2 shrink-0 border-b border-black/5 dark:border-white/5 bg-transparent/50 backdrop-blur-md sticky top-0 z-40",
                isMac ? "pt-4" : "pt-8"
            )}>
                <div className="flex gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl w-fit">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setSubTab(tab.id as any)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200",
                                subTab === tab.id
                                    ? "bg-white dark:bg-white/10 text-primary shadow-sm"
                                    : "text-tertiary hover:text-secondary"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {subTab === "locations" && (
                    <LocationsView
                        servers={props.servers}
                        activeServerId={props.activeServerId}
                        isConnected={props.isConnected}
                        onSelect={props.onSelect}
                        onToggle={props.onToggle}
                        onImport={props.onImport}
                        onEdit={props.onEdit}
                        onDelete={props.onDelete}
                        onRefresh={props.onRefresh}
                        onPing={props.onPing}
                        activeAutoNodeId={props.activeAutoNodeId}
                        connectionState={props.connectionState}
                        testingNodeIds={props.testingNodeIds}
                    />
                )}
                {subTab === "groups" && (
                    <GroupsView
                        allNodes={props.servers}
                        activeTargetId={props.activeServerId}
                        onSelectTarget={(id) => id && props.onToggle(id)}
                    />
                )}
                {subTab === "subscriptions" && (
                    <SubscriptionsView
                        profiles={props.profiles}
                        onUpdate={() => props.onRefresh()} // Mapping refresh as update or define specific
                        onDelete={props.onDeleteSubscription}
                        onAdd={props.onAddSubscription}
                        onSelect={props.onSelectSubscription}
                        onUpdateAll={props.onUpdateAllSubscriptions}
                        isImporting={false}
                        onNodeSelect={(id, selectOnly) => props.onToggle(id, !selectOnly)}
                        isConnected={props.isConnected}
                        activeServerId={props.activeServerId || undefined}
                        activeAutoNodeId={props.activeAutoNodeId}
                    />
                )}
            </div>
        </div>
    )
}

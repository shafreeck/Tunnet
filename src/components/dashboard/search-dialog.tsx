"use client"

import React, { useEffect, useState } from "react"
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command"
import { Rocket, Globe, Settings, Sliders, LayoutGrid, Zap, Server as ServerIcon, Network } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ViewType } from "@/components/dashboard/sidebar"
import { Group } from "@/components/dashboard/groups-view"
import { getLatencyColor } from "@/lib/latency"
import { cn } from "@/lib/utils"
import { getCountryName, getCountryCode } from "@/lib/flags"

interface SearchDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    servers: any[]
    groups: Group[]
    onSelectNode: (id: string) => void
    onNavigate: (view: ViewType) => void
}

export function SearchDialog({
    open,
    onOpenChange,
    servers,
    groups,
    onSelectNode,
    onNavigate
}: SearchDialogProps) {
    const { t, i18n } = useTranslation()

    const getGroupName = (group: Group) => {
        // Only translate system generated groups
        const isSystemGroup = group.id.startsWith("system:") || group.id.startsWith("auto_")
        if (!isSystemGroup) return group.name

        // Special case for AUTO
        if (group.name === "AUTO") return t('auto_select_prefix') || "Auto"
        if (group.name === "GLOBAL") return t('auto_select_global') || "Global"

        // Try to look up country code
        const code = getCountryCode(group.name)
        if (code && code !== 'un') {
            // Case 1: 2-letter code (e.g. "US", "HK")
            if (/^[a-zA-Z]{2}$/.test(group.name)) {
                return getCountryName(group.name, i18n.language)
            }

            // Case 2: Full country name (e.g. "United States", "Canada")
            // Verify by comparing with English standard name to avoid translating partial matches like "My US Server"
            const standardName = getCountryName(group.name, 'en')
            if (standardName && group.name.toLowerCase() === standardName.toLowerCase()) {
                return getCountryName(group.name, i18n.language)
            }
        }

        return group.name
    }

    // Handle keyboard shortcut
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onOpenChange(!open)
            }
        }

        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [onOpenChange, open])

    const runCommand = React.useCallback((command: () => unknown) => {
        onOpenChange(false)
        command()
    }, [onOpenChange])

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder={t('sidebar.search_placeholder', { defaultValue: "Search nodes, groups, or commands..." })} />
            <CommandList>
                <CommandEmpty>{t('sidebar.search_no_results', { defaultValue: "No results found." })}</CommandEmpty>

                <CommandGroup heading={t('sidebar.navigation', { defaultValue: "Navigation" })}>
                    <CommandItem onSelect={() => runCommand(() => onNavigate("dashboard"))}>
                        <Rocket className="mr-2 size-4" />
                        <span>{t('sidebar.dashboard')}</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => onNavigate("locations"))}>
                        <Globe className="mr-2 size-4" />
                        <span>{t('sidebar.locations')}</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => onNavigate("groups"))}>
                        <LayoutGrid className="mr-2 size-4" />
                        <span>{t('sidebar.groups')}</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => onNavigate("rules"))}>
                        <Sliders className="mr-2 size-4" />
                        <span>{t('sidebar.rules')}</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => onNavigate("settings"))}>
                        <Settings className="mr-2 size-4" />
                        <span>{t('sidebar.settings')}</span>
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading={t('sidebar.server_groups', { defaultValue: "Groups" })}>
                    {groups.map((group) => {
                        const displayName = getGroupName(group)
                        return (
                            <CommandItem
                                key={group.id}
                                onSelect={() => runCommand(() => onSelectNode(group.id))}
                                value={`group:${group.name} ${displayName}`}
                            >
                                <Network className="mr-2 size-4" />
                                <span>{displayName}</span>
                                <span className="ml-auto text-xs text-muted-foreground">{group.group_type}</span>
                            </CommandItem>
                        )
                    })}
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading={t('sidebar.servers', { defaultValue: "Servers" })}>
                    {servers.map((server) => (
                        <CommandItem
                            key={server.id}
                            onSelect={() => runCommand(() => onSelectNode(server.id))}
                            value={`${server.name} ${server.country}`}
                        >
                            <div className="mr-2 size-4 flex items-center justify-center rounded-full overflow-hidden bg-white/10">
                                {server.flagUrl ? (
                                    <img src={server.flagUrl} alt={server.country} className="w-full h-full object-cover" />
                                ) : (
                                    <Globe size={10} />
                                )}
                            </div>
                            <span>{server.name}</span>
                            <div className="ml-auto flex items-center gap-2">
                                {server.ping > 0 && (
                                    <span className={cn("text-xs font-mono", getLatencyColor(server.ping))}>
                                        {server.ping}ms
                                    </span>
                                )}
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    )
}

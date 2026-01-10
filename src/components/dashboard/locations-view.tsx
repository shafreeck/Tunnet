"use client"

import React, { useState, useMemo, useEffect } from "react"
// @ts-ignore
import { invoke } from "@tauri-apps/api/core"
import { Search, RotateCcw, Map as MapIcon, LayoutGrid, Globe as GlobeIcon, Zap, X, Target, ArrowUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getCountryName } from "@/lib/flags"

import { LocationsMap } from "./locations-map"
import { LocationGrid } from "./location-grid"
import { ServerList } from "./server-list"

interface LocationsViewProps {
    servers: any[]
    activeServerId: string | null
    isConnected: boolean
    onSelect: (id: string) => void
    onToggle: (id: string) => void
    onEdit: (node: any) => void
    onDelete: (id: string) => void
    onImport: (url: string) => Promise<void>
    onRefresh: () => void
    onPing: (id: string | string[]) => Promise<void>
    activeAutoNodeId?: string | null
    connectionState?: "idle" | "connecting" | "disconnecting"
    testingNodeIds?: string[]
}

export function LocationsView({
    servers,
    activeServerId,
    isConnected,
    onSelect,
    onToggle,
    onEdit,
    onDelete,
    onImport,
    onRefresh,
    onPing,
    activeAutoNodeId,
    connectionState,
    testingNodeIds = []
}: LocationsViewProps) {
    const { t, i18n } = useTranslation()
    const [viewMode, setViewMode] = useState<"grid" | "map">("map")
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedRegion, setSelectedRegion] = useState("All Regions")
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [showListValues, setShowListValues] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [sortBy, setSortBy] = useState<"name" | "ping">("ping")
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [isMac, setIsMac] = useState(false)

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
    }, [])

    const handleRefreshLocations = async () => {
        setIsRefreshing(true)
        try {
            const ids = servers.map(s => s.id)
            if (ids.length > 0) {
                await invoke("check_node_locations", { nodeIds: ids })
                onRefresh()
            }
        } catch (e) {
            console.error("Failed to check locations:", e)
        } finally {
            setIsRefreshing(false)
        }
    }

    const filteredServersForList = useMemo(() => {
        let list = servers
        if (selectedCountry) list = list.filter(s => s.country === selectedCountry)
        if (searchQuery) {
            list = list.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.country?.toLowerCase().includes(searchQuery.toLowerCase()))
        }
        return list
    }, [servers, selectedCountry, searchQuery])

    const handleAutoSelect = async () => {
        // Collect current filtered nodes
        const currentList = filteredServersForList

        if (currentList.length === 0) {
            toast.error(t('auto_select_empty'))
            return
        }

        const ids = currentList.map(n => n.id)
        const name = `${t('auto_select_prefix', { defaultValue: 'Auto' })} - ${selectedCountry || t('locations.all_regions')}`

        // Handle Toggle (Deactivate)
        if (isAutoActive) {
            const firstManual = currentList[0]
            if (firstManual) {
                if (isConnected) {
                    onToggle(firstManual.id)
                } else {
                    onSelect(firstManual.id)
                }
                toast.info(t('auto_select_cancelled', { defaultValue: 'Switched to manual selection' }))
                return
            }
        }

        const systemId = selectedCountry
            ? `system:region:${selectedCountry}`
            : "system:global"

        onSelect(systemId)
        onToggle(systemId)
        toast.success(t('auto_select_group_created', { name: selectedCountry || t('locations.all_regions') }))
    }

    const totalCountries = useMemo(() => {
        const s = new Set(servers.map(x => x.country))
        return s.size
    }, [servers])

    const isAutoActive = React.useMemo(() => {
        if (selectedCountry) {
            return activeServerId === `system:region:${selectedCountry}`
        }
        return activeServerId === "system:global"
    }, [activeServerId, selectedCountry])

    const activeAutoNode = useMemo(() => {
        if (!activeAutoNodeId) return null
        return servers.find(s => s.id === activeAutoNodeId || s.name === activeAutoNodeId)
    }, [servers, activeAutoNodeId])

    return (
        <div className={cn(
            "flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500",
            viewMode === "map" && "bg-transparent"
        )}>
            {/* Unified Header Style */}
            <div className={cn(
                "border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent p-5 md:pl-8 md:pb-2 shrink-0 relative z-30",
                isMac ? "md:pt-6" : "md:pt-14"
            )}>
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full relative z-10 pointer-events-none">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4">
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-1 md:mb-2 tracking-tight">{t('locations.title')}</h2>
                            <p className="text-xs md:text-sm text-text-secondary font-medium">
                                {t('locations.subtitle', { countries: totalCountries, servers: servers.length })}
                            </p>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto overflow-x-auto no-scrollbar pointer-events-auto">
                            {/* View Mode Switcher */}
                            <div className="flex bg-card-bg p-1 rounded-xl border border-border-color pointer-events-auto">
                                <button
                                    onClick={() => setViewMode("map")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                        viewMode === "map" ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
                                    )}
                                >
                                    <MapIcon size={14} />
                                    {t('locations.view.map')}
                                </button>
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                        viewMode === "grid" ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
                                    )}
                                >
                                    <LayoutGrid size={14} />
                                    {t('locations.view.grid')}
                                </button>
                            </div>

                            <button
                                onClick={handleRefreshLocations}
                                disabled={isRefreshing}
                                className={cn(
                                    "p-2.5 bg-card-bg border border-border-color rounded-xl text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-95 shadow-lg pointer-events-auto",
                                    isRefreshing && "animate-spin text-primary"
                                )}
                            >
                                <RotateCcw size={18} />
                            </button>
                        </div>
                    </div>

                    {viewMode === "grid" && (
                        <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto">
                            <div className="relative flex-1 group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-text-primary transition-colors" size={16} />
                                <input
                                    placeholder={t('locations.search_placeholder')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-primary focus:outline-none transition-all font-medium placeholder:text-text-tertiary"
                                />
                            </div>
                            <div className="flex bg-card-bg p-1 rounded-xl border border-border-color overflow-hidden">
                                {["All Regions", "Asia Pacific", "Europe", "Americas"].map((region) => (
                                    <button
                                        key={region}
                                        onClick={() => setSelectedRegion(region)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap uppercase tracking-tighter",
                                            selectedRegion === region
                                                ? "bg-primary text-white shadow-sm"
                                                : "text-text-secondary hover:text-text-primary"
                                        )}
                                    >
                                        {t(`locations.regions.${region.toLowerCase().replace(/ /g, '_')}`, { defaultValue: region })}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden bg-transparent">
                {viewMode === "grid" ? (
                    <div className="h-full overflow-y-auto px-4 md:px-8 py-4 md:py-8 sidebar-scroll">
                        <div className="max-w-5xl mx-auto w-full">
                            <LocationGrid
                                servers={servers}
                                selectedRegion={selectedRegion}
                                searchQuery={searchQuery}
                                onSelectCountry={(country) => {
                                    setSelectedCountry(country)
                                    setShowListValues(true)
                                }}
                            />
                        </div>
                    </div>
                ) : (
                    <LocationsMap
                        servers={servers}
                        activeServerId={activeServerId}
                        selectedCountry={selectedCountry}
                        onSelectCountry={(c) => {
                            setSelectedCountry(c)
                            if (c) setShowListValues(true)
                        }}
                        onSelectServer={(id) => {
                            const node = servers.find(s => s.id === id)
                            if (node) {
                                setSelectedCountry(node.country)
                                setShowListValues(true)
                                onSelect(id)
                            }
                        }}
                        onToggleServer={(id) => {
                            onToggle(id)
                        }}
                    />
                )}

                {/* Shared Server List Sidebar/Drawer - Re-styled */}
                <div className={cn(
                    "absolute top-0 bottom-0 right-0 md:top-6 md:bottom-6 md:right-6 w-full sm:w-[400px] glass-card border-l md:border border-border-color md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 transform z-40",
                    "bg-white/80 dark:bg-black/80 backdrop-blur-md", // Default: More transparent
                    "hover:bg-white/95 hover:dark:bg-black/95 hover:backdrop-blur-xl hover:shadow-2xl", // Hover: Solid & Focused
                    (showListValues || (viewMode === 'map' && selectedCountry)) ? "translate-x-0 opacity-100" : "translate-x-full md:translate-x-[120%] opacity-0"
                )}>
                    <div className="px-6 py-4 border-b border-border-color bg-card-bg flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="size-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                                <GlobeIcon size={18} />
                            </div>
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-sm font-black text-text-primary uppercase tracking-tight flex items-center gap-2 truncate">
                                    {selectedCountry ? getCountryName(selectedCountry, i18n.language) : t('locations.drawer.region_nodes')}
                                    {activeAutoNode && (
                                        <span className="text-[9px] font-normal normal-case bg-accent-green/10 text-accent-green px-1.5 py-0.5 rounded opacity-80 whitespace-nowrap">
                                            {activeAutoNode.name}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest leading-none">
                                    {t('locations.drawer.nodes_ready', { count: filteredServersForList.length })}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                            {/* Actions Group */}
                            <div className="flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-xl mr-1">
                                {/* Test Latency All */}
                                <button
                                    onClick={() => {
                                        const ids = filteredServersForList.map(s => s.id);
                                        if (ids.length > 0) {
                                            onPing(ids);
                                        }
                                    }}
                                    className="size-7 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-text-secondary hover:text-accent-orange transition-all active:scale-95"
                                    title={t('test_latency_tooltip')}
                                >
                                    <Zap size={14} className={cn(filteredServersForList.some(s => testingNodeIds.includes(s.id)) && "animate-pulse text-accent-orange")} fill={filteredServersForList.some(s => testingNodeIds.includes(s.id)) ? "currentColor" : "none"} />
                                </button>

                                {/* Auto Select */}
                                <button
                                    onClick={handleAutoSelect}
                                    className={cn(
                                        "size-7 flex items-center justify-center rounded-lg transition-all active:scale-95",
                                        isAutoActive
                                            ? "bg-accent-green/10 text-accent-green shadow-sm shadow-accent-green/20"
                                            : "hover:bg-black/5 dark:hover:bg-white/10 text-text-secondary hover:text-accent-green"
                                    )}
                                    title={t('auto_select_tooltip')}
                                >
                                    <Target size={14} fill={isAutoActive ? "currentColor" : "none"} />
                                </button>

                                {/* Sort Button & Menu */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowSortMenu(!showSortMenu)}
                                        className={cn(
                                            "size-7 flex items-center justify-center rounded-lg transition-all active:scale-95",
                                            showSortMenu ? "text-primary bg-primary/10" : "text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5"
                                        )}
                                        title={t('sort_tooltip', { defaultValue: 'Sort' })}
                                    >
                                        <ArrowUpDown size={14} />
                                    </button>

                                    {showSortMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                                            <div className="absolute right-0 top-full mt-2 w-32 bg-white dark:bg-[#1a1a1a] border border-border-color rounded-xl shadow-xl z-50 p-1 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="space-y-0.5">
                                                    <button
                                                        onClick={() => { setSortBy("name"); setShowSortMenu(false); }}
                                                        className={cn(
                                                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors text-left",
                                                            sortBy === "name" ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <span>{t('sort_by_name', { defaultValue: 'Name' })}</span>
                                                        {sortBy === "name" && <div className="size-1 rounded-full bg-primary" />}
                                                    </button>
                                                    <button
                                                        onClick={() => { setSortBy("ping"); setShowSortMenu(false); }}
                                                        className={cn(
                                                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors text-left",
                                                            sortBy === "ping" ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <span>{t('sort_by_latency', { defaultValue: 'Latency' })}</span>
                                                        {sortBy === "ping" && <div className="size-1 rounded-full bg-primary" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Close Button - Distinct */}
                            <button
                                onClick={() => { setShowListValues(false); setSelectedCountry(null); }}
                                className="size-8 flex items-center justify-center hover:bg-red-500/10 rounded-xl text-text-secondary hover:text-red-500 transition-all active:scale-90"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Search inside Drawer */}
                    <div className="px-6 py-4 border-b border-border-color bg-sidebar-bg">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-text-primary transition-colors" size={14} />
                            <input
                                placeholder={t('locations.drawer.search_placeholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-2 pl-9 pr-4 text-xs text-text-primary focus:outline-none transition-all placeholder:text-text-tertiary"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sidebar-scroll">
                        <ServerList
                            servers={filteredServersForList}
                            activeServerId={activeServerId}
                            isConnected={isConnected}
                            onSelect={onSelect}
                            onToggle={onToggle}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onImport={onImport}
                            onPing={onPing}
                            showLogs={false} // Force logs hidden, though header is hidden anyway
                            setShowLogs={() => { }}
                            logs={{ local: [], helper: [] }}
                            onClearLogs={() => { }}
                            isFiltered={!!searchQuery || !!selectedCountry}
                            connectionState={connectionState}
                            hideHeader={true}
                            testingNodeIds={testingNodeIds}
                            sortBy={sortBy}
                            onSortByChange={setSortBy}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

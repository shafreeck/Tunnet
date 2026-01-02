"use client"

import React, { useState, useMemo } from "react"
// @ts-ignore
import { invoke } from "@tauri-apps/api/core"
import { Search, RotateCcw, Map as MapIcon, LayoutGrid, Star, Globe as GlobeIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

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
    onPing: (id: string) => Promise<void>
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
    onPing
}: LocationsViewProps) {
    const { t } = useTranslation()
    const [viewMode, setViewMode] = useState<"grid" | "map">("map")
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedRegion, setSelectedRegion] = useState("All Regions")
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [showListValues, setShowListValues] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)

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

    const totalCountries = useMemo(() => {
        const s = new Set(servers.map(x => x.country))
        return s.size
    }, [servers])

    return (
        <div className={cn(
            "flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500",
            viewMode === "map" && "bg-transparent"
        )}>
            {/* Unified Header Style */}
            <div className="border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent px-8 pt-6 pb-2 shrink-0 relative z-30">
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full relative z-10 pointer-events-none">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-text-primary mb-2 tracking-tight">{t('locations.title')}</h2>
                            <p className="text-sm text-text-secondary font-medium">
                                {t('locations.subtitle', { countries: totalCountries, servers: servers.length })}
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
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
                                {["All Regions", "Asia Pacific", "Europe", "Americas", "Favorites"].map((region) => (
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
                    <div className="h-full overflow-y-auto px-8 py-8 sidebar-scroll">
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
                    />
                )}

                {/* Shared Server List Sidebar/Drawer - Re-styled */}
                <div className={cn(
                    "absolute top-6 bottom-6 right-6 w-[400px] glass-card border border-border-color rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 transform z-40",
                    "bg-white/80 dark:bg-black/60 backdrop-blur-md", // Default: More transparent
                    "hover:bg-white/95 hover:dark:bg-black/95 hover:backdrop-blur-xl hover:shadow-2xl", // Hover: Solid & Focused
                    (showListValues || (viewMode === 'map' && selectedCountry)) ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"
                )}>
                    <div className="p-8 border-b border-border-color bg-card-bg flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                                <GlobeIcon size={20} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-black text-text-primary uppercase tracking-tight">
                                    {selectedCountry || t('locations.drawer.region_nodes')}
                                </span>
                                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
                                    {t('locations.drawer.nodes_ready', { count: filteredServersForList.length })}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => { setShowListValues(false); setSelectedCountry(null); }}
                            className="size-10 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 rounded-full text-text-secondary hover:text-text-primary transition-all active:scale-90"
                        >
                            <LayoutGrid size={20} className="rotate-45" />
                        </button>
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
                            logs={[]}
                            onClearLogs={() => { }}
                            hideHeader={true}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

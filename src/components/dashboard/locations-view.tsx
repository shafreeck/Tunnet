"use client"

import React, { useState, useMemo } from "react"
// @ts-ignore
import { invoke } from "@tauri-apps/api/core"
import { Search, RotateCcw, Map as MapIcon, LayoutGrid, Star, Globe as GlobeIcon } from "lucide-react"
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
    onRefresh
}: LocationsViewProps) {
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
            viewMode === "map" && "bg-[#050505]"
        )}>
            {/* Unified Header Style */}
            <div className="border-b border-white/5 bg-black/5 backdrop-blur-md p-8 pb-6 shrink-0 relative z-30">
                <div className="max-w-5xl mx-auto w-full">
                    <div className="flex items-start justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">节点地区</h2>
                            <p className="text-sm text-gray-500 font-medium">
                                在 {totalCountries} 个国家/地区拥有 {servers.length} 个可用节点
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* View Mode Switcher */}
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                                <button
                                    onClick={() => setViewMode("map")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                        viewMode === "map" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    <MapIcon size={14} />
                                    Map
                                </button>
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                        viewMode === "grid" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                                    )}
                                >
                                    <LayoutGrid size={14} />
                                    Grid
                                </button>
                            </div>

                            <button
                                onClick={handleRefreshLocations}
                                disabled={isRefreshing}
                                className={cn(
                                    "p-2.5 bg-white/5 border border-white/5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 shadow-lg",
                                    isRefreshing && "animate-spin text-primary"
                                )}
                            >
                                <RotateCcw size={18} />
                            </button>
                        </div>
                    </div>

                    {viewMode === "grid" && (
                        <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="relative flex-1 group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-white transition-colors" size={16} />
                                <input
                                    placeholder="搜索地区或节点..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white/5 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-white/20 transition-all font-medium placeholder:text-gray-600"
                                />
                            </div>
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 overflow-hidden">
                                {["All Regions", "Asia Pacific", "Europe", "Americas", "Favorites"].map((region) => (
                                    <button
                                        key={region}
                                        onClick={() => setSelectedRegion(region)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap uppercase tracking-tighter",
                                            selectedRegion === region
                                                ? "bg-white/10 text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-300"
                                        )}
                                    >
                                        {region}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden bg-black/5">
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
                    "absolute top-6 bottom-6 right-6 w-[400px] glass-card border-white/10 rounded-[2.5rem] shadow-[0_0_50px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden transition-all duration-500 transform z-40",
                    (showListValues || (viewMode === 'map' && selectedCountry)) ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"
                )}>
                    <div className="p-8 border-b border-white/5 bg-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                                <GlobeIcon size={20} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-black text-white uppercase tracking-tight">
                                    {selectedCountry || "地区节点"}
                                </span>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                    {filteredServersForList.length} 个节点就绪
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => { setShowListValues(false); setSelectedCountry(null); }}
                            className="size-10 flex items-center justify-center hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all active:scale-90"
                        >
                            <LayoutGrid size={20} className="rotate-45" />
                        </button>
                    </div>

                    {/* Search inside Drawer */}
                    <div className="px-6 py-4 border-b border-white/5 bg-white/2">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-white transition-colors" size={14} />
                            <input
                                placeholder="搜索当前区域节点..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-white/20 transition-all placeholder:text-gray-600"
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
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

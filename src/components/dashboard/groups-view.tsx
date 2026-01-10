"use client"

import React, { useState, useEffect } from "react"
import { Plus, Search, Trash2, Edit2, LayoutGrid, Check, X, Loader2, Play, Zap, Target, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { ConfirmationModal } from "@/components/ui/confirmation-modal"
import { Switch } from "@/components/ui/switch"
import { GroupCard } from "./group-card"

export interface Group {
    id: string
    name: string
    group_type: "Selector" | "UrlTest"
    source: {
        type: "Static"
        node_ids?: string[]
    } | {
        type: "Filter"
        criteria: {
            keywords?: string[]
        }
    }
    icon?: string
}

export interface ProxyNodeStatus {
    name: string
    type: string
    alive: boolean
    udp: boolean
    xudp: boolean
    tfo: boolean
    delay?: number
    now?: string // "Name" if selected, or null
}

interface GroupsViewProps {
    allNodes: any[] // Passed from page.tsx (flattened nodes)
    activeTargetId: string | null
    onSelectTarget: (id: string | null) => void
    isConnected?: boolean
    onToggle?: (id: string) => void
}

export function GroupsView({ allNodes, activeTargetId, onSelectTarget, isConnected, onToggle }: GroupsViewProps) {
    const { t } = useTranslation()
    const [groups, setGroups] = useState<Group[]>([])
    const [showSystemGroups, setShowSystemGroups] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingGroup, setEditingGroup] = useState<Group | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Dialog State
    const [dialogName, setDialogName] = useState("")
    const [dialogType, setDialogType] = useState<"Selector" | "UrlTest">("Selector")
    const [dialogSourceType, setDialogSourceType] = useState<"Static" | "Filter">("Static")
    const [dialogNodeIds, setDialogNodeIds] = useState<Set<string>>(new Set())
    const [dialogKeywords, setDialogKeywords] = useState("")

    // Selection Dialog State
    const [selectionDialogOpen, setSelectionDialogOpen] = useState(false)
    const [activeGroupForSelection, setActiveGroupForSelection] = useState<Group | null>(null)
    const [groupNodeStatuses, setGroupNodeStatuses] = useState<ProxyNodeStatus[]>([])
    const [isSelectionLoading, setIsSelectionLoading] = useState(false)

    // Deletion Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [groupToDelete, setGroupToDelete] = useState<string | null>(null)
    const [sortBy, setSortBy] = useState<"name" | "type">("name")
    const [showSortMenu, setShowSortMenu] = useState(false)

    const sortedGroups = React.useMemo(() => {
        return [...groups].sort((a, b) => {
            switch (sortBy) {
                case "name":
                    return a.name.localeCompare(b.name)
                case "type":
                    return a.group_type.localeCompare(b.group_type)
                default:
                    return 0
            }
        })
    }, [groups, sortBy])

    useEffect(() => {
        fetchGroups()
    }, [])

    const fetchGroups = async () => {
        setIsLoading(true)
        try {
            const data = await invoke<Group[]>("get_groups")
            setGroups(data)
        } catch (e) {
            console.error("Failed to fetch groups", e)
            toast.error(t('groups.fetch_failed'))
        } finally {
            setIsLoading(false)
        }
    }

    const openDialog = (group?: Group) => {
        if (group) {
            setEditingGroup(group)
            setDialogName(group.name)
            setDialogType(group.group_type)
            if ("node_ids" in group.source) {
                setDialogSourceType("Static")
                setDialogNodeIds(new Set(group.source.node_ids || []))
                setDialogKeywords("")
            } else {
                setDialogSourceType("Filter")
                // @ts-ignore
                const kws = group.source.criteria?.keywords || []
                setDialogKeywords(kws.join(", "))
                setDialogNodeIds(new Set())
            }
        } else {
            setEditingGroup(null)
            setDialogName("")
            setDialogType("Selector")
            setDialogSourceType("Static")
            setDialogNodeIds(new Set())
            setDialogKeywords("")
        }
        setIsDialogOpen(true)
    }

    const handleSave = async () => {
        if (!dialogName.trim()) {
            toast.error(t('groups.name_required'))
            return
        }

        setIsSaving(true)
        try {
            let source: any
            if (dialogSourceType === "Static") {
                source = {
                    type: "Static",
                    node_ids: Array.from(dialogNodeIds)
                }
            } else {
                source = {
                    type: "Filter",
                    criteria: {
                        keywords: dialogKeywords.split(",").map(s => s.trim()).filter(Boolean)
                    }
                }
            }

            const payload = {
                id: editingGroup ? editingGroup.id : crypto.randomUUID(),
                name: dialogName,
                group_type: dialogType,
                source,
                icon: null
            }

            if (editingGroup) {
                await invoke("update_group", { group: payload })
                toast.success(t('groups.updated'))
            } else {
                await invoke("add_group", { group: payload })
                toast.success(t('groups.created'))
            }
            setIsDialogOpen(false)
            fetchGroups()
        } catch (e: any) {
            console.error(e)
            toast.error(t('groups.save_failed', { error: e }))
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteClick = (id: string) => {
        setGroupToDelete(id)
        setIsDeleteModalOpen(true)
    }

    const confirmDelete = async () => {
        if (!groupToDelete) return
        try {
            await invoke("delete_group", { id: groupToDelete })
            toast.success(t('groups.deleted'))
            fetchGroups()
        } catch (e: any) {
            toast.error(t('groups.delete_failed', { error: e }))
        } finally {
            setIsDeleteModalOpen(false)
            setGroupToDelete(null)
        }
    }

    const openSelectionDialog = async (group: Group) => {
        setActiveGroupForSelection(group)
        setSelectionDialogOpen(true)
        setIsSelectionLoading(true)
        try {
            const nodes = await invoke<ProxyNodeStatus[]>("get_group_alive_nodes", { groupId: group.id })
            setGroupNodeStatuses(nodes)
        } catch (e) {
            console.error(e)
            toast.error(t('groups.fetch_nodes_failed'))
        } finally {
            setIsSelectionLoading(false)
        }
    }

    const handleSelectNode = async (nodeName: string) => {
        if (!activeGroupForSelection) return
        try {
            await invoke("select_group_node", { groupId: activeGroupForSelection.id, nodeName })
            toast.success(t('groups.node_selected'))

            // Refresh list to update 'now' status
            const nodes = await invoke<ProxyNodeStatus[]>("get_group_alive_nodes", { groupId: activeGroupForSelection.id })
            setGroupNodeStatuses(nodes)
        } catch (e) {
            toast.error(t('groups.select_failed'))
        }
    }

    // Node Selection Logic
    const toggleNode = (id: string) => {
        const newSet = new Set(dialogNodeIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setDialogNodeIds(newSet)
    }

    // Group Activation Logic
    const handleActivateGroup = (id: string) => {
        if (activeTargetId === id) {
            // If connected, do nothing (keep running with current exit)
            if (isConnected) {
                return
            }
            // If disconnected, allow toggling off (deselect)
            onSelectTarget(null)
        } else {
            // Activate Logic (Switch to new group)
            onSelectTarget(id)
        }
    }

    const [isMac, setIsMac] = useState(false)

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
    }, [])

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className={cn(
                "border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent p-5 md:pl-8 md:pt-8 md:pb-6 shrink-0 relative z-20",
                !isMac && "md:pr-36"
            )}>
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full relative z-10 pointer-events-none">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 md:mb-8 gap-4 md:gap-12">
                        <div className="max-w-lg">
                            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-1 md:mb-2 tracking-tight">{t('groups.title')}</h2>
                            <p className="text-xs md:text-sm text-text-secondary font-medium">{t('groups.subtitle')}</p>
                        </div>
                        <div className="pointer-events-auto flex items-center gap-2 md:gap-4 w-full md:w-auto">
                            <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 px-2 md:px-3 py-1 md:py-1.5 rounded-xl border border-transparent hover:border-border-color transition-all flex-1 md:flex-none">
                                <span className="text-[9px] md:text-[10px] font-bold text-text-secondary uppercase">{t('groups.show_system')}</span>
                                <Switch checked={showSystemGroups} onCheckedChange={setShowSystemGroups} className="scale-75 md:scale-90 origin-right" />
                            </div>

                            <div className="relative pointer-events-auto">
                                <button
                                    onClick={() => setShowSortMenu(!showSortMenu)}
                                    className={cn(
                                        "flex items-center justify-center p-2 md:p-2.5 bg-card-bg border border-border-color text-text-secondary rounded-xl hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all",
                                        showSortMenu && "text-primary bg-primary/10 border-primary/20"
                                    )}
                                    title={t('sort_tooltip', { defaultValue: 'Sort' })}
                                >
                                    <ArrowUpDown size={16} className="md:size-[18px]" />
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
                                                    onClick={() => { setSortBy("type"); setShowSortMenu(false); }}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors text-left",
                                                        sortBy === "type" ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5"
                                                    )}
                                                >
                                                    <span>{t('sort_by_type', { defaultValue: 'Type' })}</span>
                                                    {sortBy === "type" && <div className="size-1 rounded-full bg-primary" />}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => openDialog()}
                                className="flex items-center justify-center gap-2 px-4 md:px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20 scale-100 active:scale-95 flex-none"
                            >
                                <Plus size={14} className="md:size-4" />
                                {t('groups.create')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-8 sidebar-scroll bg-transparent">
                <div className="max-w-5xl mx-auto w-full space-y-3 pb-32">
                    {groups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                            <LayoutGrid size={40} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium">{t('groups.no_groups')}</p>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Custom Groups Section */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-text-tertiary uppercase tracking-widest pl-1">{t('groups.custom_groups', { defaultValue: 'Custom Groups' })}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {sortedGroups.filter(g => !g.id.startsWith("system:") && !g.id.startsWith("auto_")).map(group => (
                                        <GroupCard
                                            key={group.id}
                                            group={group}
                                            isActive={activeTargetId === group.id}
                                            onEdit={() => openDialog(group)}
                                            onDelete={(id) => handleDeleteClick(id)}
                                            onActivate={(id) => handleActivateGroup(id)}
                                            onSelectNode={() => openSelectionDialog(group)}
                                            t={t}
                                            allNodes={allNodes || []}
                                        />
                                    ))}
                                    {groups.filter(g => !g.id.startsWith("system:") && !g.id.startsWith("auto_")).length === 0 && (
                                        <div className="col-span-full py-10 flex flex-col items-center justify-center text-text-tertiary gap-2 border border-dashed border-border-color rounded-2xl bg-black/5 dark:bg-white/5">
                                            <p className="text-xs font-medium">{t('groups.no_custom_groups', { defaultValue: 'No custom groups created' })}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* System Groups Section */}
                            {showSystemGroups && (
                                <div className="space-y-4 pt-4 border-t border-dashed border-border-color">
                                    <h3 className="text-sm font-bold text-text-tertiary uppercase tracking-widest pl-1">{t('groups.system_groups', { defaultValue: 'System Groups' })}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {sortedGroups.filter(g => g.id.startsWith("system:") || g.id.startsWith("auto_")).map(group => (
                                            <GroupCard
                                                key={group.id}
                                                group={group}
                                                isActive={activeTargetId === group.id}
                                                onEdit={() => openDialog(group)}
                                                onDelete={(id) => handleDeleteClick(id)}
                                                onActivate={(id) => handleActivateGroup(id)}
                                                onSelectNode={() => openSelectionDialog(group)}
                                                t={t}
                                                allNodes={allNodes || []}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Dialog */}
            {isDialogOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/60 animate-in fade-in duration-300">
                    <div className="fixed inset-0" onClick={() => setIsDialogOpen(false)} />
                    <div className="relative w-full max-w-2xl glass-card border border-border-color rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-border-color bg-sidebar-bg shrink-0">
                            <h3 className="text-xl font-bold text-text-primary">{editingGroup ? t('groups.edit') : t('groups.create')}</h3>
                        </div>

                        <div className="p-8 overflow-y-auto flex-1 flex flex-col gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-tertiary uppercase tracking-widest">{t('groups.name')}</label>
                                <input
                                    value={dialogName}
                                    onChange={e => setDialogName(e.target.value)}
                                    className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-3 px-4 text-sm text-text-primary focus:outline-none transition-all"
                                    placeholder={t('groups.name_placeholder')}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-widest">{t('groups.type')}</label>
                                    <div className="flex bg-card-bg p-1 rounded-xl border border-border-color">
                                        <button onClick={() => setDialogType("Selector")} className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", dialogType === "Selector" ? "bg-white/10 text-white shadow" : "text-text-secondary hover:text-text-primary")}>Selector</button>
                                        <button onClick={() => setDialogType("UrlTest")} className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", dialogType === "UrlTest" ? "bg-white/10 text-white shadow" : "text-text-secondary hover:text-text-primary")}>URL Test</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-widest">{t('groups.source')}</label>
                                    <div className="flex bg-card-bg p-1 rounded-xl border border-border-color">
                                        <button onClick={() => setDialogSourceType("Static")} className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", dialogSourceType === "Static" ? "bg-white/10 text-white shadow" : "text-text-secondary hover:text-text-primary")}>Static</button>
                                        <button onClick={() => setDialogSourceType("Filter")} className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", dialogSourceType === "Filter" ? "bg-white/10 text-white shadow" : "text-text-secondary hover:text-text-primary")}>Filter</button>
                                    </div>
                                </div>
                            </div>

                            {dialogSourceType === "Static" ? (
                                <div className="space-y-2 flex-1 flex flex-col min-h-[300px]">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-widest">{t('groups.select_nodes')}</label>
                                    <div className="flex-1 border border-border-color rounded-xl bg-black/5 dark:bg-white/5 overflow-y-auto p-2 space-y-1">
                                        {allNodes.map(node => (
                                            <div
                                                key={node.id}
                                                onClick={() => toggleNode(node.id)}
                                                className={cn("flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all", dialogNodeIds.has(node.id) ? "bg-primary/20 border border-primary/20" : "hover:bg-white/5 border border-transparent")}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={cn("size-4 rounded-full border flex items-center justify-center shrink-0", dialogNodeIds.has(node.id) ? "border-primary bg-primary" : "border-gray-500")}>
                                                        {dialogNodeIds.has(node.id) && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <span className="text-sm font-medium truncate">{node.name}</span>
                                                </div>
                                                <span className="text-[10px] text-text-tertiary uppercase">{node.protocol}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-text-tertiary uppercase tracking-widest">{t('groups.keywords')}</label>
                                    <input
                                        value={dialogKeywords}
                                        onChange={e => setDialogKeywords(e.target.value)}
                                        className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-3 px-4 text-sm text-text-primary focus:outline-none transition-all"
                                        placeholder={t('groups.keywords_placeholder')} // "e.g. US, Netflix, Premium"
                                    />
                                    <p className="text-[10px] text-text-tertiary">{t('groups.keywords_help')}</p>
                                </div>
                            )}

                        </div>

                        <div className="px-8 py-6 border-t border-border-color bg-sidebar-bg flex justify-end gap-4 shrink-0">
                            <button onClick={() => setIsDialogOpen(false)} className="px-6 py-2.5 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary transition-all">{t('groups.cancel')}</button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-8 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary-hover text-white transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                            >
                                {isSaving && <Loader2 size={14} className="animate-spin" />}
                                {t('groups.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Selection Dialog */}
            {selectionDialogOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/60 animate-in fade-in duration-300">
                    <div className="fixed inset-0" onClick={() => setSelectionDialogOpen(false)} />
                    <div className="relative w-full max-w-lg glass-card border border-border-color rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[80vh]">
                        <div className="px-8 py-6 border-b border-border-color bg-sidebar-bg shrink-0 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-text-primary">{activeGroupForSelection?.name}</h3>
                                <p className="text-xs text-text-secondary">{t('groups.select_node_desc')}</p>
                            </div>
                            <button onClick={() => setSelectionDialogOpen(false)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all">
                                <X size={20} className="text-text-tertiary" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            {isSelectionLoading ? (
                                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" /></div>
                            ) : (
                                <div className="space-y-2">
                                    {groupNodeStatuses.map(status => {
                                        const node = allNodes.find(n => n.id === status.name)
                                        const displayName = node ? node.name : status.name
                                        return (
                                            <button
                                                key={status.name}
                                                onClick={() => handleSelectNode(status.name)}
                                                className={cn(
                                                    "w-full flex items-center justify-between p-4 rounded-2xl border transition-all group",
                                                    status.now
                                                        ? "bg-primary/10 border-primary/20"
                                                        : "bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10"
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "size-3 rounded-full border-2",
                                                        status.now ? "border-primary bg-primary" : "border-text-tertiary"
                                                    )} />
                                                    <span className={cn("text-sm font-bold truncate max-w-[200px]", status.now ? "text-primary" : "text-text-primary")}>{displayName}</span>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    {status.delay !== undefined && (
                                                        <span className={cn(
                                                            "text-xs font-mono font-medium",
                                                            status.delay < 300 ? "text-emerald-500" : "text-yellow-500"
                                                        )}>
                                                            {status.delay}ms
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] uppercase font-bold text-text-tertiary bg-black/5 dark:bg-white/5 px-2 py-1 rounded-md">{status.type}</span>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                title={t('groups.delete')}
                message={t('groups.confirm_delete')}
                confirmText={t('groups.delete')}
                cancelText={t('groups.cancel')}
                onConfirm={confirmDelete}
                onCancel={() => setIsDeleteModalOpen(false)}
                isDanger
            />
        </div>
    )
}

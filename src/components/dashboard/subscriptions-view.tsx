"use client"

import React, { useState, useEffect } from "react"
import { RefreshCw, Trash2, Globe, Server, MoreHorizontal, Database, Zap, PlusCircle, Edit2, Target, ExternalLink, ArrowUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { ConfirmationModal } from "@/components/ui/confirmation-modal"
import { open } from "@tauri-apps/plugin-shell"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { Share2 } from "lucide-react"
import { ExportModal } from "@/components/dashboard/export-modal"

export interface Subscription {
    id: string
    name: string
    url?: string
    upload?: number
    download?: number
    total?: number
    expire?: number
    web_page_url?: string
    update_interval?: number
    header_update_interval?: number
    nodes: any[]
}

interface SubscriptionsViewProps {
    profiles: Subscription[]
    onUpdate: (id: string) => void
    onDelete: (id: string) => void
    onAdd?: () => void
    onSelect?: (id: string) => void
    onUpdateAll?: () => void
    isImporting?: boolean
    onNodeSelect?: (id: string, restart?: boolean, selectOnly?: boolean) => void
    isConnected?: boolean
    activeServerId?: string
    activeAutoNodeId?: string | null
    testingNodeIds?: string[]
}

export function SubscriptionsView({ profiles, onUpdate, onDelete, onAdd, onSelect, onUpdateAll, isImporting, onNodeSelect, isConnected, activeServerId, activeAutoNodeId, testingNodeIds = [] }: SubscriptionsViewProps) {
    const { t } = useTranslation()

    const getDisplayName = (name: string) => {
        const lower = name.toLowerCase()
        if (lower === "new subscription" || lower === "新订阅") return t('subscriptions.new_subscription')
        if (lower === "local import" || lower === "本地导入") return t('subscriptions.local_import')
        if (lower === "qr import" || lower === "二维码导入") return t('qr_import')
        return name
    }

    // Helper formats
    const formatBytes = (bytes: number, decimals = 1) => {
        if (bytes === 0) return '0 B'
        if (!itemsValid(bytes)) return '0 B'
        const k = 1024
        const dm = decimals < 0 ? 0 : decimals
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }

    const getRemainingDays = (expire?: number) => {
        if (!expire || expire === 0) return null
        const now = Math.floor(Date.now() / 1000)
        const diff = expire - now
        if (diff <= 0) return t('subscriptions.expired', { defaultValue: 'Expired' })
        const days = Math.max(1, Math.floor(diff / (24 * 3600)))
        return t('subscriptions.remaining_days', { count: days, defaultValue: `Remaining ${days} days` })
    }

    const itemsValid = (n?: number) => n !== undefined && n !== null && !isNaN(n)

    const [editingProfile, setEditingProfile] = useState<Subscription | null>(null)
    const [profileToDelete, setProfileToDelete] = useState<{ id: string, name: string } | null>(null)
    const [sortBy, setSortBy] = useState<"name" | "usage" | "nodes" | "expiry">("name")
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [isMac, setIsMac] = useState(false)
    const [targetProfile, setTargetProfile] = useState<{ id: string, name: string } | null>(null)

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
    }, [])

    const sortedProfiles = React.useMemo(() => {
        return [...profiles].sort((a, b) => {
            switch (sortBy) {
                case "name":
                    return getDisplayName(a.name).localeCompare(getDisplayName(b.name))
                case "usage":
                    const usageA = (a.upload || 0) + (a.download || 0)
                    const usageB = (b.upload || 0) + (b.download || 0)
                    return usageB - usageA // Most used first
                case "nodes":
                    return b.nodes.length - a.nodes.length // Most nodes first
                case "expiry":
                    const expA = a.expire || 2147483647 // Far future if no expiry
                    const expB = b.expire || 2147483647
                    return expA - expB // Expiring soon first
                default:
                    return 0
            }
        })
    }, [profiles, sortBy])

    const handleDeleteClick = (id: string, name: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setProfileToDelete({ id, name })
    }

    const activeAutoNode = React.useMemo(() => {
        if (!activeAutoNodeId) return null
        // Search through all nodes in all profiles
        for (const p of profiles) {
            const found = p.nodes.find((n: any) => n.id === activeAutoNodeId || n.name === activeAutoNodeId)
            if (found) return found
        }
        return null
    }, [profiles, activeAutoNodeId])

    // Helper to check if a specific profile is the active auto one
    const isProfileAutoActive = (profileId: string) => {
        return activeServerId === `system:sub:${profileId}`
    }
    const handleEditClick = (profile: Subscription, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingProfile(profile)
    }

    const handleEditConfirm = async (data: any) => {
        if (!editingProfile) return
        try {
            await invoke("edit_profile", {
                id: editingProfile.id,
                name: data.name,
                url: data.url,
                updateInterval: data.update_interval,
                clearInterval: data.clear_interval
            })
            toast.success(t('subscriptions.edit_success', { defaultValue: 'Updated successfully' }))
            onUpdateAll?.() // Refresh list
        } catch (error) {
            toast.error(String(error))
        } finally {
            setEditingProfile(null)
        }
    }

    const handleAutoSelect = async (profile: Subscription, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!onNodeSelect) return

        const candidates = profile.nodes

        if (candidates.length === 0) {
            toast.error(t('auto_select_empty'))
            return
        }

        const groupId = `system:sub:${profile.id}`

        // Handle Toggle (Deactivate)
        if (activeServerId === groupId) {
            const firstManual = candidates[0]
            if (firstManual) {
                if (isConnected) {
                    onNodeSelect(firstManual.id)
                } else {
                    onNodeSelect(firstManual.id)
                }
                toast.info(t('auto_select_cancelled', { defaultValue: 'Switched to manual selection' }))
                return
            }
        }

        try {
            // No need to ensure_auto_group, system:sub:* groups are always available backend-side
            if (isConnected) {
                onNodeSelect(groupId)
            } else {
                onNodeSelect(groupId, isConnected ?? false)
            }
            toast.success(t('auto_select_group_created', { name: getDisplayName(profile.name) }))
        } catch (err: any) {
            toast.error(t('toast.action_failed', { error: err }))
        }
    }



    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Unified Header */}
            <div className={cn(
                "border-b border-black/2 dark:border-white/2 bg-transparent pl-8 shrink-0 relative z-30 pr-8",
                !isMac ? "pt-8 pb-2" : "pt-6 pb-2"
            )}>
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full flex items-center justify-between relative z-10 pointer-events-none">
                    <div>
                        <h2 className="text-2xl font-bold text-text-primary mb-2 tracking-tight">{t('subscriptions.title')}</h2>
                        <p className="text-sm text-text-secondary font-medium">{t('subscriptions.subtitle')}</p>
                    </div>

                    <div className="flex items-center gap-3 pointer-events-auto">
                        <div className="relative">
                            <button
                                onClick={() => setShowSortMenu(!showSortMenu)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 bg-card-bg border border-border-color text-text-secondary rounded-xl hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all font-medium text-sm",
                                    showSortMenu && "text-primary bg-primary/10 border-primary/20"
                                )}
                            >
                                <ArrowUpDown size={18} />
                            </button>
                            {showSortMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-[#1a1a1a] border border-border-color rounded-xl shadow-xl z-50 p-1 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="space-y-0.5">
                                            {[
                                                { id: "name", label: t('sort_by_name', { defaultValue: 'Name' }) },
                                                { id: "usage", label: t('sort_by_usage', { defaultValue: 'Usage' }) },
                                                { id: "nodes", label: t('sort_by_nodes', { defaultValue: 'Nodes' }) },
                                                { id: "expiry", label: t('sort_by_expiry', { defaultValue: 'Expiry' }) },
                                            ].map((option) => (
                                                <button
                                                    key={option.id}
                                                    onClick={() => { setSortBy(option.id as any); setShowSortMenu(false); }}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                                                        sortBy === option.id ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5"
                                                    )}
                                                >
                                                    <span>{option.label}</span>
                                                    {sortBy === option.id && <div className="size-1 rounded-full bg-primary" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {onUpdateAll && (
                            <button
                                onClick={onUpdateAll}
                                className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color text-text-secondary rounded-xl hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all font-medium text-sm"
                            >
                                <RefreshCw size={18} />
                                <span>{t('subscriptions.update_all')}</span>
                            </button>
                        )}
                        {profiles.length > 0 && (
                            <button
                                onClick={() => setTargetProfile({ id: "all", name: t('export.all_nodes_name', { defaultValue: "All Nodes" }) })}
                                className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color text-text-secondary rounded-xl hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all font-medium text-sm"
                                title={t('export.all_nodes_tooltip', { defaultValue: "Export all nodes from all subscriptions" })}
                            >
                                <Share2 size={18} />
                                <span>{t('export.all_nodes_button', { defaultValue: "Export All" })}</span>
                            </button>
                        )}
                        {onAdd && (
                            <button
                                onClick={onAdd}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors font-medium text-sm shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95"
                            >
                                <PlusCircle size={18} />
                                <span>{t('subscriptions.import')}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 py-10 sidebar-scroll bg-transparent">
                <div className="max-w-5xl mx-auto w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                        {/* Loading Skeleton */}
                        {isImporting && (
                            <div className="glass-card flex flex-col p-6 rounded-[2rem] bg-card-bg/50 border border-border-color relative overflow-hidden animate-pulse">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-start gap-4">
                                        <div className="size-14 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center">
                                            <div className="size-8 bg-black/5 dark:bg-white/5 rounded-full" />
                                        </div>
                                        <div className="flex flex-col gap-2 w-32 pt-1">
                                            <div className="h-5 bg-black/5 dark:bg-white/5 rounded-md w-full" />
                                            <div className="h-3 bg-black/5 dark:bg-white/5 rounded-md w-2/3" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <div className="h-3 bg-black/5 dark:bg-white/5 rounded-md w-16" />
                                            <div className="h-3 bg-black/5 dark:bg-white/5 rounded-md w-8" />
                                        </div>
                                        <div className="h-3 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden" />
                                    </div>
                                    <div className="flex items-center justify-between pt-4 border-t border-border-color border-dashed opacity-50">
                                        <div className="flex items-center gap-4">
                                            <div className="h-8 w-24 bg-black/5 dark:bg-white/5 rounded-xl" />
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                            </div>
                        )}

                        {sortedProfiles.map(profile => {
                            const used = (profile.upload || 0) + (profile.download || 0)
                            const total = profile.total || 0
                            const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0

                            return (
                                <div key={profile.id} onClick={() => onSelect && onSelect(profile.id)} className="glass-card flex flex-col p-6 rounded-[2rem] bg-card-bg hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-500 group border border-border-color relative overflow-hidden cursor-pointer shadow-sm hover:shadow-xl">
                                    {/* Header Section */}
                                    <div className="flex items-start justify-between mb-8 gap-4 overflow-hidden">
                                        <div className="flex items-center gap-4 min-w-0 flex-1">
                                            <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform duration-500 shadow-inner">
                                                <Globe size={24} />
                                            </div>
                                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                <h3 className="font-bold text-text-primary text-base group-hover:text-primary transition-colors uppercase tracking-tight truncate leading-tight">{getDisplayName(profile.name)}</h3>
                                                <span className="text-[10px] font-medium text-text-tertiary truncate opacity-60" title={profile.url}>
                                                    {profile.url ? profile.url.replace(/^https?:\/\//, '') : t('subscriptions.local_profile')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Buttons - Animated width to give space to title when hidden */}
                                        <div className="flex items-center gap-1 transition-all duration-300 max-w-0 group-hover:max-w-[220px] overflow-hidden opacity-0 group-hover:opacity-100 shrink-0">
                                            {profile.url && (() => {
                                                const isTesting = profile.nodes.some(n => testingNodeIds.includes(n.id));
                                                return (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onUpdate(profile.id); }}
                                                        disabled={isTesting}
                                                        className={cn(
                                                            "p-2 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90",
                                                            isTesting && "opacity-70 cursor-wait"
                                                        )}
                                                        title={t('subscriptions.refresh_tooltip')}
                                                    >
                                                        <RefreshCw size={14} className={cn(isTesting && "animate-spin")} />
                                                    </button>
                                                );
                                            })()}
                                            <button
                                                onClick={(e) => handleAutoSelect(profile, e)}
                                                className={cn(
                                                    "p-2 rounded-xl transition-all active:scale-95",
                                                    isProfileAutoActive(profile.id)
                                                        ? "bg-accent-green/10 text-accent-green"
                                                        : "hover:bg-accent-green/10 text-text-tertiary hover:text-accent-green"
                                                )}
                                                title={t('auto_select_tooltip')}
                                            >
                                                <Target size={14} />
                                            </button>
                                            {profile.web_page_url && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (profile.web_page_url) {
                                                            open(profile.web_page_url);
                                                        }
                                                    }}
                                                    className="p-2 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                                                    title={t('subscriptions.visit_website', { defaultValue: 'Visit Website' })}
                                                >
                                                    <ExternalLink size={14} />
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => handleEditClick(profile, e)}
                                                className="p-2 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                                                title={t('subscriptions.edit_tooltip', { defaultValue: 'Edit Subscription' })}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setTargetProfile({ id: profile.id, name: profile.name }); }}
                                                className="p-2 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                                                title={t('export.tooltip', { defaultValue: 'Export / Share' })}
                                            >
                                                <Share2 size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(profile.id, profile.name, e)}
                                                className="p-2 text-text-tertiary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-90"
                                                title={t('subscriptions.delete_tooltip')}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Main Content */}
                                    <div className="flex-1 space-y-6">
                                        {/* Traffic Progress */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-baseline">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-xl font-black text-text-primary tracking-tight">
                                                        {formatBytes(used)}
                                                    </span>
                                                    <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
                                                        / {total > 0 ? formatBytes(total) : '--'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/5 border border-primary/10">
                                                    <span className="text-xs font-black text-primary">{percent.toFixed(1)}%</span>
                                                </div>
                                            </div>
                                            <div className="h-2 w-full bg-black/5 dark:bg-black/20 rounded-full overflow-hidden p-[2px] border border-black/5 dark:border-white/5">
                                                <div
                                                    className="h-full bg-linear-to-r from-primary to-primary-hover rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(var(--primary),0.3)]"
                                                    style={{ width: `${total > 0 ? percent : 0}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Metadata Row */}
                                        <div className="flex items-center gap-6 pt-4 border-t border-black/3 dark:border-white/3">
                                            <div className="flex items-center gap-2">
                                                <Database size={12} className="text-text-tertiary" />
                                                <span className="text-[11px] font-bold text-text-secondary">
                                                    {t('subscriptions.nodes', { count: profile.nodes.length })}
                                                </span>
                                            </div>

                                            {profile.expire && profile.expire > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <Zap size={12} className="text-accent-orange" />
                                                    <span className="text-[11px] font-bold text-text-secondary" title={new Date(profile.expire * 1000).toLocaleString()}>
                                                        {getRemainingDays(profile.expire)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Decoration Glow */}
                                    <div className="absolute -bottom-10 -right-10 size-40 bg-primary/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                </div>
                            )
                        })}

                        {editingProfile && (
                            <EditSubscriptionModal
                                isOpen={!!editingProfile}
                                onClose={() => setEditingProfile(null)}
                                onSave={handleEditConfirm}
                                initialData={editingProfile}
                            />
                        )}

                        {profiles.length === 0 && (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-600 gap-4">
                                <Database size={48} className="opacity-10" />
                                <p className="text-sm font-medium">{t('subscriptions.no_subs')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>


            <ConfirmationModal
                isOpen={!!profileToDelete}
                title={t('subscriptions.delete_title')}
                message={t('subscriptions.delete_message')}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                isDanger
                onConfirm={() => {
                    if (profileToDelete) {
                        onDelete(profileToDelete.id)
                        setProfileToDelete(null)
                    }
                }}
                onCancel={() => setProfileToDelete(null)}
            />

            {targetProfile && (
                <ExportModal
                    isOpen={!!targetProfile}
                    onClose={() => setTargetProfile(null)}
                    targetId={targetProfile.id}
                    targetName={targetProfile.name}
                    targetType={targetProfile.id === "all" ? "all-nodes" : "profile"}
                />
            )}
        </div >
    )
}

export function EditSubscriptionModal({ isOpen, onClose, onSave, initialData }: { isOpen: boolean, onClose: () => void, onSave: (data: any) => Promise<void>, initialData: Subscription }) {
    const { t } = useTranslation()

    const getDisplayName = (name: string) => {
        const trimmed = (name || "").trim();
        const lower = trimmed.toLowerCase()
        if (lower === "new subscription" || lower === "新订阅") return t('subscriptions.new_subscription')
        if (lower === "local import" || lower === "本地导入") return t('subscriptions.local_import')
        if (lower === "qr import" || lower === "二维码导入") return t('qr_import')
        return trimmed
    }

    const [name, setName] = useState(getDisplayName(initialData.name))
    const [url, setUrl] = useState(initialData.url || "")
    const [interval, setInterval] = useState(initialData.update_interval ? String(initialData.update_interval / 60) : "") // Show in minutes

    const handleSave = () => {
        // Convert interval back to seconds if present
        let intervalSec: number | undefined = undefined;
        let clearInterval = false;

        if (interval === "") {
            clearInterval = true;
        } else if (!isNaN(Number(interval))) {
            const val = Number(interval);
            if (val === 0) {
                intervalSec = 0; // Disable
            } else {
                intervalSec = val * 60;
            }
        }

        onSave({
            id: initialData.id,
            name,
            url: url || undefined,
            update_interval: intervalSec,
            clear_interval: clearInterval
        })
    }

    if (!isOpen) return null

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/40 animate-in fade-in duration-500">
            <div className="bg-surface border border-border-color w-full max-w-md rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
                <div className="flex items-center justify-between px-8 py-4 border-b border-border-color bg-sidebar-bg/50">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-black text-text-primary uppercase tracking-tight">
                            {t('subscriptions.edit_subscription', { defaultValue: 'Edit Subscription' })}
                        </h3>
                    </div>
                </div>
                <div className="p-8 space-y-4">

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">{t('subscriptions.name', { defaultValue: "Name" })}</label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/50 rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none transition-all"
                                placeholder={t('subscriptions.name_placeholder', { defaultValue: "My Subscription" })}
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                        </div>

                        {initialData.url && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">{t('subscriptions.url', { defaultValue: "Subscription URL" })}</label>
                                    <input
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                        className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/50 rounded-xl px-4 py-2 text-xs text-text-primary focus:outline-none transition-all font-mono"
                                        placeholder="https://example.com/sub"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        spellCheck={false}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">{t('subscriptions.auto_update', { defaultValue: "Auto Update Interval (Min)" })}</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={interval}
                                            onChange={e => setInterval(e.target.value)}
                                            className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/50 rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none transition-all"
                                            placeholder={
                                                initialData.header_update_interval
                                                    ? t('subscriptions.default_interval', { count: Math.round(initialData.header_update_interval / 60), defaultValue: `Default: ${Math.round(initialData.header_update_interval / 60)} min` })
                                                    : t('subscriptions.interval_placeholder', { defaultValue: "e.g. 60 (Empty to disable)" })
                                            }
                                            autoCapitalize="none"
                                            autoCorrect="off"
                                            spellCheck={false}
                                        />
                                    </div>
                                    <p className="text-[10px] text-text-tertiary">{t('subscriptions.interval_hint', { defaultValue: "Leave empty to use default. Set to 0 to disable." })}</p>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-border-color mt-6">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-2xl text-sm font-bold text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-95"
                        >
                            {t('common.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2.5 rounded-2xl text-sm font-black text-white bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95 uppercase tracking-tight"
                        >
                            {t('common.save', { defaultValue: 'Save' })}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

"use client"

import React, { useState } from "react"
import { RefreshCw, Trash2, Globe, Server, MoreHorizontal, Database, Zap, PlusCircle, Edit2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { InputModal } from "@/components/ui/input-modal"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"

interface Subscription {
    id: string
    name: string
    url?: string
    upload?: number
    download?: number
    total?: number
    expire?: number
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
    onNodeSelect?: (id: string, selectOnly?: boolean) => void
    isConnected?: boolean
    activeServerId?: string
    activeAutoNodeId?: string | null
}

export function SubscriptionsView({ profiles, onUpdate, onDelete, onAdd, onSelect, onUpdateAll, isImporting, onNodeSelect, isConnected, activeServerId, activeAutoNodeId }: SubscriptionsViewProps) {
    const { t } = useTranslation()

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

    const itemsValid = (n?: number) => n !== undefined && n !== null && !isNaN(n)

    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [renamingName, setRenamingName] = useState("")
    const [profileToDelete, setProfileToDelete] = useState<{ id: string, name: string } | null>(null)

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
    const isProfileAutoActive = (profileName: string) => {
        return activeServerId?.startsWith("auto_") && activeServerId.includes(profileName.toLowerCase().replace(/[^a-z0-9]/g, ''))
    }
    const handleRenameClick = (id: string, currentName: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setRenamingId(id)
        setRenamingName(currentName)
    }

    const handleRenameConfirm = async (newName: string) => {
        if (!renamingId) return
        try {
            await invoke("rename_profile", { id: renamingId, newName })
            toast.success(t('subscriptions.rename_success', { defaultValue: 'Renamed successfully' }))
            onUpdateAll?.() // Refresh list
        } catch (error) {
            toast.error(String(error))
        } finally {
            setRenamingId(null)
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

        const ids = candidates.map((n: any) => n.id)
        const name = `${t('auto_select_prefix', { defaultValue: 'Auto' })} - ${getDisplayName(profile.name)}`

        // Handle Toggle (Deactivate)
        // Uses same heuristic as styling
        const isAutoActive = activeServerId?.startsWith("auto_") && activeServerId.includes(profile.name.toLowerCase().replace(/[^a-z0-9]/g, ''))

        if (isAutoActive) {
            const firstManual = candidates[0]
            if (firstManual) {
                if (isConnected) {
                    // We need to support toggle. 
                    // But onNodeSelect here only supports switching to an ID.
                    // The parent (page.tsx) handleServerToggle handles logic.
                    // We just pass the ID.
                    // Wait, `onNodeSelect` maps to `handleServerToggle`.
                    // If we pass an ID that is DIFFERENT from current active, it switches.
                    onNodeSelect(firstManual.id)
                } else {
                    onNodeSelect(firstManual.id)
                }
                toast.info(t('auto_select_cancelled', { defaultValue: 'Switched to manual selection' }))
                return
            }
        }

        try {
            const groupId: string = await invoke("ensure_auto_group", {
                name,
                references: ids,
                groupType: "url-test"
            })

            // If proxy is connected, we force a switch (which implies restart/reconfigure)
            // If proxy is NOT connected, we pass selectOnly=true (or handle it in parent, but SubscriptionsView doesn't know parent logic deeply)
            // Actually, if we pass `selectOnly` flag to onNodeSelect, assuming parent handles it?
            // page.tsx `handleServerToggle` usually Toggles.
            // Let's modify onNodeSelect signature above to accept optional boolean?
            // Better: We check `isConnected` here.

            if (isConnected) {
                onNodeSelect(groupId)
            } else {
                if (activeServerId === groupId) {
                    // Do nothing?
                }
                // We want to "Just Select". But onNodeSelect maps to `handleServerToggle`.
                // We need to tell `handleServerToggle` NOT to connect?
                // `handleServerToggle(id, forceConnect?)`
                // This requires updating page.tsx signature OR passing a different callback.
                // Alternatively, `page.tsx` can pass `setActiveServerId` as a separate prop?
                // But `onNodeSelect` is already "Select Node".
                // Let's assume onNodeSelect receives a second arg `shouldConnect`?
                // Updating `onNodeSelect` inside SubscriptionsView to pass `!isConnected` as `noConnect`?
                // Let's try passing `false` as second arg for "auto-connect"?

                // Ideally: onNodeSelect(groupId, isConnected)
                // But page.tsx `handleServerToggle` takes `(id: string)`.
                // Modifying `handleServerToggle` is invasive.

                // Simpler: If not connected, we assume selecting the group is enough for "Active Server" state?
                // But `SubscriptionsView` cannot set global active server ID directly unless passed a setter?
                // `onNodeSelect` IS the setter/toggler.

                // Let's modify `SubscriptionsViewProps` to accept `onSetActive`? No.
                // Let's update `onNodeSelect` to `(id: string, connect: boolean) => void`.
                onNodeSelect(groupId, isConnected ?? false)
            }
            toast.success(t('auto_select_group_created', { name }))
        } catch (err: any) {
            toast.error(t('toast.action_failed', { error: err }))
        }
    }

    const getDisplayName = (name: string) => {
        const lower = name.toLowerCase()
        if (lower === "new subscription" || lower === "新订阅") return t('subscriptions.new_subscription')
        if (lower === "local import" || lower === "本地导入") return t('subscriptions.local_import')
        return name
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Unified Header */}
            <div className="border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent px-8 pt-6 pb-2 shrink-0 relative z-30">
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full flex items-center justify-between relative z-10 pointer-events-none">
                    <div>
                        <h2 className="text-2xl font-bold text-text-primary mb-2 tracking-tight">{t('subscriptions.title')}</h2>
                        <p className="text-sm text-text-secondary font-medium">{t('subscriptions.subtitle')}</p>
                    </div>

                    <div className="flex items-center gap-3 pointer-events-auto">
                        {onUpdateAll && (
                            <button
                                onClick={onUpdateAll}
                                className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color text-text-secondary rounded-xl hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all font-medium text-sm"
                            >
                                <RefreshCw size={18} />
                                <span>{t('subscriptions.update_all')}</span>
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
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                            </div>
                        )}

                        {profiles.map(profile => {
                            const used = (profile.upload || 0) + (profile.download || 0)
                            const total = profile.total || 0
                            const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0

                            return (
                                <div key={profile.id} onClick={() => onSelect && onSelect(profile.id)} className="glass-card flex flex-col p-6 rounded-[2rem] bg-card-bg hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-500 group border border-border-color relative overflow-hidden cursor-pointer">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-start gap-4 overflow-hidden">
                                            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform duration-500">
                                                <Globe size={28} />
                                            </div>
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <h3 className="font-bold text-text-primary text-lg group-hover:text-primary transition-colors uppercase tracking-tight truncate">{getDisplayName(profile.name)}</h3>
                                                <span className="text-[10px] font-mono text-text-tertiary truncate" title={profile.url}>
                                                    {profile.url ? profile.url.replace(/^https?:\/\//, '') : t('subscriptions.local_profile')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Progress Section */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1">{t('subscriptions.traffic_usage')}</span>
                                                    <span className="text-sm font-black text-text-primary">{formatBytes(used)} / {total > 0 ? formatBytes(total) : '--'}</span>
                                                </div>
                                                <span className="text-sm font-black text-primary">{percent.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-3 w-full bg-black/10 dark:bg-black/40 rounded-full overflow-hidden p-0.5 border border-black/5 dark:border-white/5">
                                                <div
                                                    className="h-full bg-gradient-to-r from-primary to-primary-hover rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                                                    style={{ width: `${total > 0 ? percent : 0}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-4 border-t border-border-color">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-8 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-secondary">
                                                        <Database size={14} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-text-tertiary uppercase">{t('subscriptions.node_count')}</span>
                                                        <span className="text-xs font-bold text-text-secondary">{t('subscriptions.nodes', { count: profile.nodes.length })}</span>
                                                    </div>
                                                </div>
                                                {profile.expire && (
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-8 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-secondary">
                                                            <Zap size={14} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-bold text-text-tertiary uppercase">{t('subscriptions.expire_time')}</span>
                                                            <span className="text-xs font-bold text-text-secondary">{new Date(profile.expire * 1000).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {profile.url && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onUpdate(profile.id); }}
                                                        className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                                                        title={t('subscriptions.refresh_tooltip')}
                                                    >
                                                        <RefreshCw size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => handleAutoSelect(profile, e)}
                                                    className={cn(
                                                        "size-8 flex items-center justify-center rounded-full transition-all active:scale-95",
                                                        // Check if activeServerId matches expected "Auto - SubscriptionName"
                                                        // We don't have the auto-generated ID easily available locally unless we reconstruct it.
                                                        // Heuristic: If activeServerId starts with "auto_" and current profile nodes contain the active node?
                                                        // No, activeServerId maps to the GROUP, not a node.
                                                        // Heuristic: If activeServerId starts with "auto_" and we click?
                                                        // Better: Just check if activeServerId starts with "auto_".
                                                        // Since we are in subscription view, this is acceptable feedback.
                                                        // Ideally we check if `activeServerId` matches the group ID we would generate for this profile.
                                                        // Group name = "Auto - " + profile.name.
                                                        // ID = "auto_" + sanitized(profile.name).
                                                        // Let's rely on simple `startsWith("auto_")` + maybe exact match if we can sanitize.
                                                        // For now, simpler visual feedback:
                                                        // If activeServerId is truthy and startsWith("auto_"), we assume it MIGHT be this one if we just clicked it.
                                                        // But to be precise:
                                                        activeServerId?.startsWith("auto_") && activeServerId.includes(profile.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
                                                            ? "bg-accent-green/10 text-accent-green"
                                                            : "hover:bg-accent-green/10 text-text-tertiary hover:text-accent-green"
                                                    )}
                                                    title={t('auto_select_tooltip')}
                                                >
                                                    <Zap size={16} fill={activeServerId?.startsWith("auto_") && activeServerId.includes(profile.name.toLowerCase().replace(/[^a-z0-9]/g, '')) ? "currentColor" : "none"} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleRenameClick(profile.id, profile.name, e)}
                                                    className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                                                    title={t('subscriptions.rename')}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(profile.id); }}
                                                    className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-90"
                                                    title={t('subscriptions.delete_tooltip')}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Subtle Overlay Glow */}
                                    <div className="absolute -bottom-10 -right-10 size-40 bg-primary/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                </div>
                            )
                        })}

                        <InputModal
                            isOpen={!!renamingId}
                            title={t('subscriptions.rename_subscription')}
                            message={t('subscriptions.enter_new_name')}
                            defaultValue={renamingName}
                            confirmText={t('common.confirm', { defaultValue: 'Confirm' })}
                            cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
                            onConfirm={handleRenameConfirm}
                            onCancel={() => setRenamingId(null)}
                        />

                        {profiles.length === 0 && (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-600 gap-4">
                                <Database size={48} className="opacity-10" />
                                <p className="text-sm font-medium">{t('subscriptions.no_subs')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

"use client"

import React from "react"
import { RefreshCw, Trash2, Globe, Server, MoreHorizontal, Database, Zap, PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"

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
}

export function SubscriptionsView({ profiles, onUpdate, onDelete, onAdd, onSelect, onUpdateAll, isImporting }: SubscriptionsViewProps) {

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

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Unified Header */}
            <div className="border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent px-8 pt-6 pb-2 shrink-0 relative z-30">
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full flex items-center justify-between relative z-10 pointer-events-none">
                    <div>
                        <h2 className="text-2xl font-bold text-text-primary mb-2 tracking-tight">订阅管理</h2>
                        <p className="text-sm text-text-secondary font-medium">查看并同步您的节点订阅信息</p>
                    </div>

                    <div className="flex items-center gap-3 pointer-events-auto">
                        {onUpdateAll && (
                            <button
                                onClick={onUpdateAll}
                                className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border-color text-text-secondary rounded-xl hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all font-medium text-sm"
                            >
                                <RefreshCw size={18} />
                                <span>全部更新</span>
                            </button>
                        )}
                        {onAdd && (
                            <button
                                onClick={onAdd}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors font-medium text-sm shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95"
                            >
                                <PlusCircle size={18} />
                                <span>导入订阅</span>
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
                                                <h3 className="font-bold text-text-primary text-lg group-hover:text-primary transition-colors uppercase tracking-tight truncate">{profile.name}</h3>
                                                <span className="text-[10px] font-mono text-text-tertiary truncate" title={profile.url}>
                                                    {profile.url ? profile.url.replace(/^https?:\/\//, '') : "Local Profile"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Progress Section */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1">流量使用情况</span>
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
                                                        <span className="text-[9px] font-bold text-text-tertiary uppercase">节点数量</span>
                                                        <span className="text-xs font-bold text-text-secondary">{profile.nodes.length} Nodes</span>
                                                    </div>
                                                </div>
                                                {profile.expire && (
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-8 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-secondary">
                                                            <Zap size={14} />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-bold text-text-tertiary uppercase">到期时间</span>
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
                                                        title="刷新订阅"
                                                    >
                                                        <RefreshCw size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(profile.id); }}
                                                    className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-90"
                                                    title="删除订阅"
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

                        {profiles.length === 0 && (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-600 gap-4">
                                <Database size={48} className="opacity-10" />
                                <p className="text-sm font-medium">暂无订阅信息，请导入配置包</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

"use client"

import React from "react"
import { RefreshCw, Trash2, Globe, Server, MoreHorizontal, Database, Zap } from "lucide-react"
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
}

export function SubscriptionsView({ profiles, onUpdate, onDelete }: SubscriptionsViewProps) {

    // Helper formats
    const formatBytes = (bytes: number, decimals = 1) => {
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
            <div className="border-b border-white/5 bg-black/5 backdrop-blur-md p-8 pb-6 shrink-0">
                <div className="max-w-5xl mx-auto w-full">
                    <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">订阅管理</h2>
                    <p className="text-sm text-gray-500 font-medium">查看并同步您的节点订阅信息</p>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 py-10 sidebar-scroll bg-black/5">
                <div className="max-w-5xl mx-auto w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                        {profiles.map(profile => {
                            const used = (profile.upload || 0) + (profile.download || 0)
                            const total = profile.total || 0
                            const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0

                            return (
                                <div key={profile.id} className="glass-card flex flex-col p-6 rounded-[2rem] hover:bg-white/8 transition-all duration-500 group ring-1 ring-white/5 hover:ring-white/10 relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-start gap-4">
                                            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                                                <Globe size={28} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <h3 className="font-bold text-white text-lg group-hover:text-primary/90 transition-colors uppercase tracking-tight">{profile.name}</h3>
                                                <span className="text-[10px] font-mono text-gray-500 truncate max-w-[200px]" title={profile.url}>
                                                    {profile.url ? profile.url.replace(/^https?:\/\//, '') : "Local Profile"}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {profile.url && (
                                                <button
                                                    onClick={() => onUpdate(profile.id)}
                                                    className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all active:scale-90"
                                                    title="Update Subscription"
                                                >
                                                    <RefreshCw size={18} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onDelete(profile.id)}
                                                className="p-2.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-2xl transition-all active:scale-90"
                                                title="Delete Subscription"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Progress Section */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">流量使用情况</span>
                                                    <span className="text-sm font-black text-white">{formatBytes(used)} / {total > 0 ? formatBytes(total) : '--'}</span>
                                                </div>
                                                <span className="text-sm font-black text-primary">{percent.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/5">
                                                <div
                                                    className="h-full bg-gradient-to-r from-primary to-primary-hover rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                                                    style={{ width: `${total > 0 ? percent : 0}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="size-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-500">
                                                    <Database size={14} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-bold text-gray-500 uppercase">节点数量</span>
                                                    <span className="text-xs font-bold text-gray-300">{profile.nodes.length} Nodes</span>
                                                </div>
                                            </div>
                                            {profile.expire && (
                                                <div className="flex items-center gap-3">
                                                    <div className="size-8 rounded-xl bg-white/5 flex items-center justify-center text-gray-500">
                                                        <Zap size={14} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-gray-500 uppercase">到期时间</span>
                                                        <span className="text-xs font-bold text-gray-300">{new Date(profile.expire * 1000).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Subtle Overlay Glow */}
                                    <div className="absolute -bottom-10 -right-10 size-40 bg-primary/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
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

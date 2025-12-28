"use client"

import React, { useState, useEffect } from "react"
import { Plus, Search, Trash2, Edit2, Shield, Globe, Monitor, AlertCircle, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"

interface Rule {
    id: string
    type: "DOMAIN" | "DOMAIN_SUFFIX" | "DOMAIN_KEYWORD" | "IP_CIDR" | "GEOIP" | "FINAL"
    value: string
    policy: "PROXY" | "DIRECT" | "REJECT"
    enabled: boolean
    description?: string
}

// Presets Configuration
const PRESETS = {
    "Smart Connect": {
        defaultPolicy: "PROXY",
        rules: [
            { id: "1", type: "GEOIP", value: "geoip-cn", policy: "DIRECT", enabled: true, description: "Direct connection for Mainland China IPs" },
            { id: "2", type: "DOMAIN", value: "geosite:geosite-cn", policy: "DIRECT", enabled: true, description: "Direct connection for Mainland China Domains" },
            { id: "3", type: "DOMAIN_SUFFIX", value: "google.com", policy: "PROXY", enabled: true, description: "Force Google via Proxy" },
            { id: "4", type: "IP_CIDR", value: "192.168.0.0/16", policy: "DIRECT", enabled: true, description: "Local Network" },
            { id: "5", type: "DOMAIN_KEYWORD", value: "ads", policy: "REJECT", enabled: true, description: "Block Ads" },
        ] as Rule[]
    },
    "Global Proxy": {
        defaultPolicy: "PROXY",
        rules: [] as Rule[]
    },
    "Global Direct": {
        defaultPolicy: "DIRECT",
        rules: [] as Rule[]
    },
    "Bypass LAN & CN": {
        defaultPolicy: "PROXY",
        rules: [
            { id: "1", type: "GEOIP", value: "geoip-cn", policy: "DIRECT", enabled: true, description: "Direct connection for Mainland China IPs" },
            { id: "2", type: "DOMAIN", value: "geosite:geosite-cn", policy: "DIRECT", enabled: true, description: "Direct connection for Mainland China Domains" },
            { id: "4", type: "IP_CIDR", value: "192.168.0.0/16", policy: "DIRECT", enabled: true, description: "Local Network" },
        ] as Rule[]
    }
}

export function RulesView() {
    const [rules, setRules] = useState<Rule[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedPolicy, setSelectedPolicy] = useState<"ALL" | "PROXY" | "DIRECT" | "REJECT">("ALL")
    const [defaultPolicy, setDefaultPolicy] = useState<"PROXY" | "DIRECT">("PROXY")
    const [isFallbackOpen, setIsFallbackOpen] = useState(false)
    const [isPresetOpen, setIsPresetOpen] = useState(false)
    const [currentPreset, setCurrentPreset] = useState("Custom")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingRule, setEditingRule] = useState<Rule | null>(null)
    const [dialogData, setDialogData] = useState<Partial<Rule>>({
        type: "DOMAIN",
        value: "",
        policy: "PROXY",
        enabled: true,
        description: ""
    })

    useEffect(() => {
        const savedPreset = localStorage.getItem("tunnet_rules_preset")
        if (savedPreset) setCurrentPreset(savedPreset)
        fetchRules()
    }, [])

    const fetchRules = async () => {
        try {
            const allRules = await invoke<Rule[]>("get_rules")
            const finalRule = allRules.find(r => r.type === "FINAL")
            const normalRules = allRules.filter(r => r.type !== "FINAL")
            setRules(normalRules)
            if (finalRule) setDefaultPolicy(finalRule.policy as "PROXY" | "DIRECT")
        } catch (error) {
            console.error("Failed to fetch rules:", error)
        }
    }

    const saveRulesToBackend = async (rulesToSave: Rule[], policy: "PROXY" | "DIRECT") => {
        const finalRule: Rule = {
            id: "final-policy",
            type: "FINAL",
            value: "default",
            policy: policy,
            enabled: true,
            description: "Default Fallback Policy"
        }
        const payload = [...rulesToSave, finalRule]
        await invoke("save_rules", { rules: payload })
    }

    const handleApplyPreset = async (name: string) => {
        const preset = PRESETS[name as keyof typeof PRESETS]
        if (preset) {
            try {
                const newRules = preset.rules.map(r => ({ ...r, id: crypto.randomUUID() }))
                const newPolicy = preset.defaultPolicy as "PROXY" | "DIRECT"
                await saveRulesToBackend(newRules, newPolicy)
                setRules(newRules)
                setDefaultPolicy(newPolicy)
                setCurrentPreset(name)
                localStorage.setItem("tunnet_rules_preset", name)
                setIsPresetOpen(false)
                toast.success(`Applied preset: ${name}`)
            } catch (err) {
                toast.error("Failed to apply preset")
            }
        }
    }

    const handleDeleteRule = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            const newRules = rules.filter(r => r.id !== id)
            await saveRulesToBackend(newRules, defaultPolicy)
            setRules(newRules)
            toast.success("Rule deleted")
        } catch (err) {
            toast.error("Failed to delete rule")
        }
    }

    const handleSaveRule = async () => {
        if (!dialogData.value) {
            toast.error("Value is required")
            return
        }
        try {
            let newRules: Rule[]
            if (editingRule) {
                newRules = rules.map(r => r.id === editingRule.id ? { ...r, ...dialogData } as Rule : r)
            } else {
                newRules = [...rules, { ...dialogData, id: crypto.randomUUID(), enabled: true } as Rule]
            }
            await saveRulesToBackend(newRules, defaultPolicy)
            setRules(newRules)
            setIsDialogOpen(false)
            toast.success(editingRule ? "Rule updated" : "Rule added")
        } catch (err) {
            toast.error("Failed to save rule")
        }
    }

    const filteredRules = rules.filter(r => {
        const matchesSearch = r.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
        const matchesPolicy = selectedPolicy === "ALL" || r.policy === selectedPolicy
        return matchesSearch && matchesPolicy
    })

    const getPolicyColor = (policy: string) => {
        switch (policy) {
            case "PROXY": return "text-purple-400 bg-purple-400/10 border-purple-400/20"
            case "DIRECT": return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
            case "REJECT": return "text-red-400 bg-red-400/10 border-red-400/20"
            default: return "text-gray-400"
        }
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Unified Header Style */}
            <div className="border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent p-8 pb-6 shrink-0 relative z-20">
                <div className="max-w-5xl mx-auto w-full">
                    <div className="flex items-start justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-text-primary mb-2 tracking-tight">路由规则</h2>
                            <p className="text-sm text-text-secondary font-medium">配置流量如何通过域名、IP 等特征进行分流</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="relative">
                                <button
                                    onClick={() => setIsPresetOpen(!isPresetOpen)}
                                    className="flex items-center gap-2 px-4 py-2 bg-card-bg hover:bg-black/5 dark:hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-border-color"
                                >
                                    <span className="opacity-50">预设方案:</span>
                                    <span>{currentPreset}</span>
                                    <ChevronDown size={14} className="opacity-50" />
                                </button>
                                {isPresetOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsPresetOpen(false)} />
                                        <div className="absolute right-0 top-full mt-2 w-52 bg-card-bg backdrop-blur-xl border border-border-color rounded-2xl shadow-2xl z-20 py-1 overflow-hidden animate-in zoom-in-95 duration-200">
                                            {Object.keys(PRESETS).map((name) => (
                                                <button
                                                    key={name}
                                                    onClick={() => handleApplyPreset(name)}
                                                    className={cn(
                                                        "w-full text-left px-4 py-3 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold",
                                                        currentPreset === name ? "text-primary bg-primary/5" : "text-text-secondary"
                                                    )}
                                                >
                                                    {name}
                                                    {currentPreset === name && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => { setEditingRule(null); setDialogData({ type: "DOMAIN", value: "", policy: "PROXY", enabled: true }); setIsDialogOpen(true); }}
                                className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-primary/20 scale-100 active:scale-95"
                            >
                                <Plus size={16} />
                                新增规则
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-text-primary transition-colors" size={16} />
                            <input
                                placeholder="搜索规则..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-primary focus:outline-none transition-all font-medium placeholder:text-text-tertiary"
                            />
                        </div>
                        <div className="flex bg-card-bg p-1 rounded-xl border border-border-color">
                            {(["ALL", "PROXY", "DIRECT", "REJECT"] as const).map(policy => (
                                <button
                                    key={policy}
                                    onClick={() => setSelectedPolicy(policy)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider",
                                        selectedPolicy === policy ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
                                    )}
                                >
                                    {policy}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 py-8 sidebar-scroll bg-transparent">
                <div className="max-w-5xl mx-auto w-full space-y-3 pb-32">
                    {filteredRules.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                            <AlertCircle size={40} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium">未找到相关规则</p>
                        </div>
                    ) : (
                        filteredRules.map((rule) => (
                            <div
                                key={rule.id}
                                className="glass-card flex items-center justify-between p-4 rounded-2xl hover:bg-black/5 dark:hover:bg-white/8 transition-all duration-300 group border border-transparent hover:border-border-color"
                            >
                                <div className="flex items-center gap-6 flex-1">
                                    <div className="w-32 shrink-0">
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 w-fit">
                                            <Shield size={12} className="text-primary/70" />
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{rule.type.replace('_', ' ')}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-sm font-semibold text-text-primary font-mono truncate">{rule.value}</span>
                                        {rule.description && <span className="text-xs text-text-secondary truncate mt-0.5">{rule.description}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-8">
                                    <div className={cn(
                                        "px-3 py-1 rounded-full text-[10px] font-bold border tracking-widest uppercase w-20 text-center",
                                        getPolicyColor(rule.policy)
                                    )}>
                                        {rule.policy}
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                                        <button onClick={(e) => { setEditingRule(rule); setDialogData({ ...rule }); setIsDialogOpen(true); }} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"><Edit2 size={16} /></button>
                                        <button onClick={(e) => handleDeleteRule(rule.id, e)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Bottom Default Status */}
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
                <button
                    onClick={() => setIsFallbackOpen(!isFallbackOpen)}
                    className="pointer-events-auto glass-card flex items-center gap-4 px-6 py-3 rounded-2xl border-border-color shadow-2xl hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95 group"
                >
                    <div className="flex flex-col items-start">
                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest leading-none mb-1">默认分流策略</span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-text-primary">所有其它流量</span>
                            <div className={cn("size-1.5 rounded-full animate-pulse bg-primary")} />
                        </div>
                    </div>
                    <div className="h-8 w-px bg-white/10 mx-2" />
                    <div className={cn(
                        "px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase border",
                        getPolicyColor(defaultPolicy)
                    )}>
                        {defaultPolicy}
                    </div>
                </button>
            </div>

            {/* Modal - Simplified Integration */}
            {isDialogOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/60 animate-in fade-in duration-500">
                    <div className="fixed inset-0" onClick={() => setIsDialogOpen(false)} />
                    <div className="relative w-full max-w-lg glass-card border border-border-color rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="px-10 py-8 border-b border-border-color bg-sidebar-bg">
                            <h3 className="text-xl font-bold text-text-primary tracking-tight">{editingRule ? "编辑路由规则" : "新增路由规则"}</h3>
                        </div>
                        <div className="p-10 flex flex-col gap-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">规则类型</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["DOMAIN", "DOMAIN_SUFFIX", "DOMAIN_KEYWORD", "IP_CIDR", "GEOIP"] as const).map(type => (
                                        <button key={type} onClick={() => setDialogData({ ...dialogData, type })} className={cn("px-2 py-2.5 rounded-xl text-[10px] font-bold border transition-all truncate uppercase tracking-tighter", dialogData.type === type ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" : "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10")}>{type.replace('_', ' ')}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">特征值</label>
                                <input value={dialogData.value} onChange={(e) => setDialogData({ ...dialogData, value: e.target.value })} className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-2xl py-3.5 px-5 text-sm text-text-primary focus:outline-none transition-all font-mono" />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">出口动作</label>
                                <div className="flex bg-card-bg p-1.5 rounded-[1.25rem] border border-border-color">
                                    {(["PROXY", "DIRECT", "REJECT"] as const).map(policy => (
                                        <button key={policy} onClick={() => setDialogData({ ...dialogData, policy })} className={cn("flex-1 py-2.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest", dialogData.policy === policy ? (policy === "PROXY" ? "bg-purple-500 text-white shadow-lg" : policy === "DIRECT" ? "bg-emerald-500 text-white shadow-lg" : "bg-red-500 text-white shadow-lg") : "text-text-secondary hover:text-text-primary")}>{policy}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="px-10 py-8 border-t border-border-color bg-sidebar-bg flex justify-end gap-4">
                            <button onClick={() => setIsDialogOpen(false)} className="px-6 py-3 rounded-2xl text-xs font-bold text-text-secondary hover:text-text-primary transition-all">取消</button>
                            <button onClick={handleSaveRule} className="px-8 py-3 rounded-2xl text-xs font-bold bg-primary hover:bg-primary-hover text-white transition-all shadow-xl shadow-primary/20 scale-100 active:scale-95">确定保存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

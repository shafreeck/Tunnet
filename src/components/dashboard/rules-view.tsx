"use client"

import React, { useState, useEffect } from "react"
import { Plus, Search, Trash2, Edit2, Shield, Globe, Monitor, AlertCircle, ChevronUp, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { Group } from "./groups-view"

interface Rule {
    id: string
    type: "DOMAIN" | "DOMAIN_SUFFIX" | "DOMAIN_KEYWORD" | "IP_CIDR" | "GEOIP" | "FINAL"
    value: string
    policy: string // Changed from strict literal to string to support group IDs
    enabled: boolean
    description?: string
}

const LEGACY_DESCRIPTION_MAP: Record<string, string> = {
    "Direct connection for Mainland China IPs": "rules.description.geoip_cn",
    "Direct connection for Mainland China Domains": "rules.description.geosite_cn",
    "Force Google via Proxy": "rules.description.google",
    "Local Network": "rules.description.local_network",
    "Block Ads": "rules.description.ads"
}

// Presets Configuration
const PRESETS = {
    "Smart Connect": {
        defaultPolicy: "PROXY",
        rules: [
            { id: "1", type: "GEOIP", value: "geoip-cn", policy: "DIRECT", enabled: true, description: "rules.description.geoip_cn" },
            { id: "2", type: "DOMAIN", value: "geosite:geosite-cn", policy: "DIRECT", enabled: true, description: "rules.description.geosite_cn" },
            { id: "3", type: "DOMAIN_SUFFIX", value: "google.com", policy: "PROXY", enabled: true, description: "rules.description.google" },
            { id: "4", type: "IP_CIDR", value: "192.168.0.0/16", policy: "DIRECT", enabled: true, description: "rules.description.local_network" },
            { id: "5", type: "DOMAIN_KEYWORD", value: "ads", policy: "REJECT", enabled: true, description: "rules.description.ads" },
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
            { id: "1", type: "GEOIP", value: "geoip-cn", policy: "DIRECT", enabled: true, description: "rules.description.geoip_cn" },
            { id: "2", type: "DOMAIN", value: "geosite:geosite-cn", policy: "DIRECT", enabled: true, description: "rules.description.geosite_cn" },
            { id: "4", type: "IP_CIDR", value: "192.168.0.0/16", policy: "DIRECT", enabled: true, description: "rules.description.local_network" },
        ] as Rule[]
    }
}

const getPresetName = (name: string, t: any) => {
    switch (name) {
        case "Smart Connect": return t('rules.preset.smart')
        case "Global Proxy": return t('rules.preset.global_proxy')
        case "Global Direct": return t('rules.preset.global_direct')
        case "Bypass LAN & CN": return t('rules.preset.bypass_lan_cn')
        case "Custom": return t('rules.preset.custom')
        default: return name
    }
}

export function RulesView() {
    const { t } = useTranslation()
    const [rules, setRules] = useState<Rule[]>([])
    const [groups, setGroups] = useState<Group[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedPolicy, setSelectedPolicy] = useState<"ALL" | "PROXY" | "DIRECT" | "REJECT">("ALL")
    const [defaultPolicy, setDefaultPolicy] = useState<"PROXY" | "DIRECT" | "REJECT">("PROXY")
    const [isFallbackOpen, setIsFallbackOpen] = useState(false)
    const [isPresetOpen, setIsPresetOpen] = useState(false)
    const [currentPreset, setCurrentPreset] = useState("Custom")
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingRule, setEditingRule] = useState<Rule | null>(null)
    const [currentlyApplying, setCurrentlyApplying] = useState(false)
    const [loadingRuleId, setLoadingRuleId] = useState<string | null>(null)
    const [loadingDefaultPolicy, setLoadingDefaultPolicy] = useState(false)
    const [isSavingRule, setIsSavingRule] = useState(false)
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
    const [openRuleMenuId, setOpenRuleMenuId] = useState<string | null>(null)
    const [ruleMenuPos, setRuleMenuPos] = useState<{ top?: number, bottom?: number, right: number } | null>(null)
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
        if (savedPreset) setCurrentPreset(savedPreset)
        fetchRules()
        fetchGroups()
    }, [])

    const fetchGroups = async () => {
        try {
            const data = await invoke<Group[]>("get_groups")
            setGroups(data)
        } catch (e) {
            console.error("Failed to fetch groups", e)
        }
    }

    const fetchRules = async () => {
        try {
            const allRules = await invoke<Rule[]>("get_rules")
            const finalRule = allRules.find(r => r.type === "FINAL")
            let normalRules = allRules.filter(r => r.type !== "FINAL")

            // Auto-migrate legacy descriptions
            let hasChanges = false
            normalRules = normalRules.map(r => {
                if (r.description && LEGACY_DESCRIPTION_MAP[r.description]) {
                    hasChanges = true
                    return { ...r, description: LEGACY_DESCRIPTION_MAP[r.description] }
                }
                return r
            })

            if (hasChanges) {
                const finalPolicy = finalRule ? finalRule.policy : "PROXY"
                const payload = [...normalRules]
                if (finalRule) payload.push(finalRule)
                await invoke("save_rules", { rules: payload })
                // No need to refetch, we have the updated rules
            }

            setRules(normalRules)
            if (finalRule) setDefaultPolicy(finalRule.policy as any)
        } catch (error) {
            console.error("Failed to fetch rules:", error)
        }
    }

    const saveRulesToBackend = async (rulesToSave: Rule[], policy: string) => {
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
        let preset: { rules: Rule[], defaultPolicy: string } | undefined
        if (name === "Custom") {
            const saved = localStorage.getItem("tunnet_rules_custom")
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    preset = parsed
                } catch (e) {
                    console.error("Failed to parse custom rules", e)
                }
            }
            if (!preset) {
                // If no saved custom rules, use current as custom or defaults?
                // For now, if empty, maybe just apply nothing or error?
                // Better: if empty, init with current rules as custom?
                // Let's assume if it's select from dropdown, it should exist roughly.
                // But if not, just use empty or current rules is safer.
                // Actually if I click Custom from dropdown and I have no saved custom rules, I probably expect nothing or previous state.
                // Let's show error if not found? Or just initialize it.
                // Let's initialize with empty rules but Proxy default.
                preset = { rules: [], defaultPolicy: "PROXY" }
            }
        } else {
            preset = PRESETS[name as keyof typeof PRESETS]
        }

        if (preset) {
            setCurrentlyApplying(true)
            try {
                // For Custom, we rely on the saved IDs ideally, but generating new ones is fine too to ensure uniqueness if needed.
                // Actually for Custom we should probably keep IDs if possible?
                // But `save_rules` doesn't care much about IDs except for identifying.
                // If we restore custom, we probably want the exact same state.
                const newRules = preset.rules // Keep original IDs if possible
                const newPolicy = preset.defaultPolicy
                await saveRulesToBackend(newRules, newPolicy)
                setRules(newRules)
                setDefaultPolicy(newPolicy as any)
                setCurrentPreset(name)
                localStorage.setItem("tunnet_rules_preset", name)
                setIsPresetOpen(false)
                toast.success(t('rules.toast.applied_preset', { name: getPresetName(name, t) }))
            } catch (err) {
                toast.error(t('rules.toast.failed_preset'))
            } finally {
                setCurrentlyApplying(false)
            }
        }
    }

    const switchToCustom = (updatedRules: Rule[], updatedPolicy: string) => {
        setCurrentPreset("Custom")
        localStorage.setItem("tunnet_rules_preset", "Custom")
        localStorage.setItem("tunnet_rules_custom", JSON.stringify({
            rules: updatedRules,
            defaultPolicy: updatedPolicy
        }))
    }

    const handleDeleteRule = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (deletingRuleId) return
        setDeletingRuleId(id)
        try {
            const newRules = rules.filter(r => r.id !== id)
            await saveRulesToBackend(newRules, defaultPolicy)
            await saveRulesToBackend(newRules, defaultPolicy)
            await saveRulesToBackend(newRules, defaultPolicy)
            setRules(newRules)
            switchToCustom(newRules, defaultPolicy)
            toast.success(t('rules.toast.rule_deleted'))
        } catch (err) {
            toast.error(t('rules.toast.delete_failed'))
        } finally {
            setDeletingRuleId(null)
        }
    }

    const handleSaveRule = async () => {
        if (!dialogData.value) {
            toast.error(t('rules.toast.value_required'))
            return
        }
        if (isSavingRule) return
        setIsSavingRule(true)
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
            switchToCustom(newRules, defaultPolicy)
            toast.success(editingRule ? t('rules.toast.rule_updated') : t('rules.toast.rule_added'))
        } catch (err) {
            toast.error(t('rules.toast.save_failed'))
        } finally {
            setIsSavingRule(false)
        }
    }

    const getNextPolicy = (current: string) => {
        const standard: string[] = ["PROXY", "DIRECT", "REJECT"]
        const groupIds = groups.map(g => g.id)
        const sequence = [...standard, ...groupIds]
        const nextIndex = (sequence.indexOf(current) + 1) % sequence.length
        return sequence[nextIndex]
    }

    const handleUpdateRulePolicy = async (ruleId: string, newPolicy: string) => {
        if (loadingRuleId) return
        setLoadingRuleId(ruleId)
        try {
            const newRules = rules.map(r => r.id === ruleId ? { ...r, policy: newPolicy } as Rule : r)
            await saveRulesToBackend(newRules, defaultPolicy)
            switchToCustom(newRules, defaultPolicy)
            setRules(newRules) // Update local state immediately
            toast.success(t('rules.toast.rule_updated'))
        } catch (err) {
            toast.error(t('rules.toast.save_failed'))
        } finally {
            setLoadingRuleId(null)
            setOpenRuleMenuId(null)
        }
    }

    const handleCycleDefaultPolicy = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (loadingDefaultPolicy) return
        setLoadingDefaultPolicy(true)
        const nextPolicy = getNextPolicy(defaultPolicy)
        try {
            await saveRulesToBackend(rules, nextPolicy)
            setDefaultPolicy(nextPolicy as any)
            switchToCustom(rules, nextPolicy)
            toast.success(t('rules.toast.rule_updated'))
        } catch (err) {
            setDefaultPolicy(defaultPolicy)
            toast.error(t('rules.toast.save_failed'))
        } finally {
            setLoadingDefaultPolicy(false)
        }
    }

    const filteredRules = rules.filter(r => {
        const matchesSearch = r.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
        const matchesPolicy = selectedPolicy === "ALL" || r.policy === selectedPolicy
        return matchesSearch && matchesPolicy
    })

    const getPolicyColor = (policy: string) => {
        if (groups.some(g => g.id === policy)) {
            return "text-blue-400 bg-blue-400/10 border-blue-400/20"
        }
        switch (policy) {
            case "PROXY": return "text-purple-400 bg-purple-400/10 border-purple-400/20"
            case "DIRECT": return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
            case "REJECT": return "text-red-400 bg-red-400/10 border-red-400/20"
            default: return "text-gray-400"
        }
    }

    const getPolicyLabel = (policy: string) => {
        const group = groups.find(g => g.id === policy)
        if (group) return group.name
        // @ts-ignore
        return t(`rules.policies.${policy.toLowerCase()}`)
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Unified Header Style */}
            <div className="border-b border-black/[0.02] dark:border-white/[0.02] bg-transparent p-5 md:p-8 md:pb-6 shrink-0 relative z-20">
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="max-w-5xl mx-auto w-full relative z-10 pointer-events-none">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4 md:gap-12">
                        <div className="max-w-lg">
                            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-1 md:mb-2 tracking-tight">{t('rules.title')}</h2>
                            <p className="text-xs md:text-sm text-text-secondary font-medium">{t('rules.subtitle')}</p>
                        </div>
                        <div className="flex gap-2 md:gap-4 pointer-events-auto shrink-0 w-full md:w-auto">
                            <div className="relative">
                                <button
                                    onClick={() => !currentlyApplying && setIsPresetOpen(!isPresetOpen)}
                                    disabled={currentlyApplying}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 bg-card-bg hover:bg-black/5 dark:hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-border-color",
                                        currentlyApplying ? "opacity-70 cursor-wait" : ""
                                    )}
                                >
                                    <span className="opacity-50">{t('rules.preset.label')}</span>
                                    <span>{getPresetName(currentPreset, t)}</span>
                                    {currentlyApplying ? (
                                        <Loader2 size={14} className="opacity-50 animate-spin" />
                                    ) : (
                                        <ChevronDown size={14} className="opacity-50" />
                                    )}
                                </button>
                                {isPresetOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsPresetOpen(false)} />
                                        <div className="absolute right-0 top-full mt-2 w-52 bg-white/90 dark:bg-black/80 backdrop-blur-xl border border-border-color rounded-2xl shadow-2xl z-20 py-1 overflow-hidden animate-in zoom-in-95 duration-200">
                                            {[...Object.keys(PRESETS), "Custom"].map((name) => (
                                                <button
                                                    key={name}
                                                    onClick={() => handleApplyPreset(name)}
                                                    className={cn(
                                                        "w-full text-left px-4 py-3 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold",
                                                        currentPreset === name ? "text-primary bg-primary/5" : "text-text-secondary"
                                                    )}
                                                >
                                                    {getPresetName(name, t)}
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
                                {t('rules.add_rule')}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pointer-events-auto">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-text-primary transition-colors" size={16} />
                            <input
                                placeholder={t('rules.search_placeholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-primary focus:outline-none transition-all font-medium placeholder:text-text-tertiary"
                            />
                        </div>
                        <div className="flex bg-card-bg p-1 rounded-xl border border-border-color">
                            {/* Filter bar - maybe just standard policies for filter? or all? */}
                            {/* For now let's just keep standard filters to avoid clutter, as groups are dynamic */}
                            {(["ALL", "PROXY", "DIRECT", "REJECT"] as const).map(policy => (
                                <button
                                    key={policy}
                                    onClick={() => setSelectedPolicy(policy)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider",
                                        selectedPolicy === policy ? "bg-primary text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
                                    )}
                                >
                                    {t(`rules.policies.${policy.toLowerCase()}` as any)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-8 sidebar-scroll bg-transparent">
                <div className="max-w-5xl mx-auto w-full space-y-3 pb-32">
                    {filteredRules.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                            <AlertCircle size={40} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium">{t('rules.no_rules_found')}</p>
                        </div>
                    ) : (
                        filteredRules.map((rule) => (
                            <div
                                key={rule.id}
                                className="glass-card flex items-center justify-between p-4 rounded-2xl hover:bg-black/5 dark:hover:bg-white/8 transition-all duration-300 group border border-transparent hover:border-border-color"
                            >
                                <div className="flex items-center gap-3 md:gap-6 flex-1 min-w-0">
                                    <div className="w-20 md:w-32 shrink-0 hidden sm:block">
                                        <div className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-xl bg-white/5 border border-white/5 w-fit">
                                            <Shield size={10} className="md:size-3 text-primary/70" />
                                            <span className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-widest">{rule.type.replace('_', ' ')}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-xs md:text-sm font-semibold text-text-primary font-mono truncate">{rule.value}</span>
                                        {rule.description && <span className="text-[10px] md:text-xs text-text-secondary truncate mt-0.5">{t(rule.description)}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 md:gap-8 shrink-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (openRuleMenuId === rule.id) {
                                                setOpenRuleMenuId(null);
                                                return;
                                            }
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const MENU_HEIGHT = 280; // Approximate max height
                                            const right = window.innerWidth - rect.right;

                                            // Check collision with bottom
                                            if (rect.bottom + MENU_HEIGHT > window.innerHeight) {
                                                setRuleMenuPos({
                                                    bottom: window.innerHeight - rect.top + 8,
                                                    right
                                                });
                                            } else {
                                                setRuleMenuPos({
                                                    top: rect.bottom + 8,
                                                    right
                                                });
                                            }
                                            setOpenRuleMenuId(rule.id);
                                        }}
                                        disabled={loadingRuleId === rule.id}
                                        className={cn(
                                            "px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-bold border tracking-widest uppercase w-16 md:w-20 text-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center relative z-0",
                                            getPolicyColor(rule.policy),
                                            loadingRuleId === rule.id ? "opacity-70 cursor-wait" : ""
                                        )}>
                                        {loadingRuleId === rule.id ? (
                                            <Loader2 size={10} className="animate-spin" />
                                        ) : (
                                            <span className="truncate">{getPolicyLabel(rule.policy)}</span>
                                        )}
                                    </button>
                                    <div className="flex items-center gap-1 md:gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300 translate-x-0 md:translate-x-2 md:group-hover:translate-x-0">
                                        <button onClick={(e) => { setEditingRule(rule); setDialogData({ ...rule }); setIsDialogOpen(true); }} className="p-1.5 md:p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"><Edit2 size={14} className="md:size-4" /></button>
                                        <button
                                            onClick={(e) => handleDeleteRule(rule.id, e)}
                                            disabled={deletingRuleId === rule.id}
                                            className={cn(
                                                "p-1.5 md:p-2 rounded-xl transition-all",
                                                deletingRuleId === rule.id
                                                    ? "text-red-400 bg-red-400/10 cursor-wait"
                                                    : "text-gray-400 hover:text-red-400 hover:bg-red-400/10"
                                            )}
                                        >
                                            {deletingRuleId === rule.id ? (
                                                <Loader2 size={14} className="md:size-4 animate-spin" />
                                            ) : (
                                                <Trash2 size={14} className="md:size-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Bottom Default Status */}
            <div className={cn(
                "fixed left-0 right-0 z-30 pointer-events-none flex justify-center",
                "bottom-[72px] md:bottom-10" // Adjust bottom position for mobile to be above BottomNav
            )}>
                <div
                    className={cn(
                        "pointer-events-auto glass-card flex items-center justify-between md:justify-start gap-4 transition-all active:scale-95 group cursor-pointer relative",
                        "w-full mx-4 px-5 py-4 rounded-[2rem] border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.3)]", // Mobile: Near full-width bar
                        "md:w-auto md:mx-0 md:px-6 md:py-3 md:rounded-2xl md:border md:shadow-2xl" // Desktop: Floating pill
                    )}
                >
                    {isFallbackOpen && (
                        <>
                            <div className="fixed inset-0 z-0" onClick={() => setIsFallbackOpen(false)} />
                            <div className={cn(
                                "absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-white/90 dark:bg-black/80 backdrop-blur-xl border border-border-color rounded-2xl shadow-2xl z-20 py-2 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200",
                                "max-w-[calc(100vw-32px)]"
                            )}>
                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                    <div className="px-4 py-2 text-[10px] font-bold text-text-tertiary uppercase tracking-widest border-b border-border-color/50 mb-1">{t('rules.dialog.policy')}</div>
                                    {(["PROXY", "DIRECT", "REJECT"] as const).map(policy => (
                                        <button
                                            key={policy}
                                            onClick={() => {
                                                if (loadingDefaultPolicy) return
                                                setLoadingDefaultPolicy(true)
                                                saveRulesToBackend(rules, policy)
                                                    .then(() => {
                                                        setDefaultPolicy(policy)
                                                        switchToCustom(rules, policy)
                                                        toast.success(t('rules.toast.rule_updated'))
                                                    })
                                                    .catch(() => {
                                                        toast.error(t('rules.toast.save_failed'))
                                                    })
                                                    .finally(() => {
                                                        setLoadingDefaultPolicy(false)
                                                        setIsFallbackOpen(false)
                                                    })
                                            }}
                                            className={cn(
                                                "w-full text-left px-4 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-between font-bold",
                                                defaultPolicy === policy ? "text-primary bg-primary/5" : "text-text-secondary"
                                            )}
                                        >
                                            {t(`rules.policies.${policy.toLowerCase()}` as any)}
                                            {defaultPolicy === policy && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                        </button>
                                    ))}

                                    {groups.length > 0 && (
                                        <>
                                            <div className="px-4 py-2 text-[10px] font-bold text-text-tertiary uppercase tracking-widest border-b border-border-color/50 mt-2 mb-1 border-t">{t('groups.title')}</div>
                                            {groups.map(group => (
                                                <button
                                                    key={group.id}
                                                    onClick={() => {
                                                        if (loadingDefaultPolicy) return
                                                        setLoadingDefaultPolicy(true)
                                                        saveRulesToBackend(rules, group.id)
                                                            .then(() => {
                                                                setDefaultPolicy(group.id as any)
                                                                switchToCustom(rules, group.id)
                                                                toast.success(t('rules.toast.rule_updated'))
                                                            })
                                                            .catch(() => {
                                                                toast.error(t('rules.toast.save_failed'))
                                                            })
                                                            .finally(() => {
                                                                setLoadingDefaultPolicy(false)
                                                                setIsFallbackOpen(false)
                                                            })
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-4 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-between font-bold",
                                                        defaultPolicy === group.id ? "text-primary bg-primary/5" : "text-text-secondary"
                                                    )}
                                                >
                                                    <span className="truncate">{group.name}</span>
                                                    {defaultPolicy === group.id && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                    <div className="flex flex-col items-start min-w-0" onClick={() => setIsFallbackOpen(!isFallbackOpen)}>
                        <span className="text-[9px] md:text-[10px] font-bold text-text-tertiary uppercase tracking-widest leading-none mb-1">{t('rules.default_policy')}</span>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs md:text-sm font-bold text-text-primary truncate">{t('rules.all_other_traffic')}</span>
                            <div className={cn("size-1 md:size-1.5 rounded-full animate-pulse bg-primary shrink-0")} />
                        </div>
                    </div>
                    <div className="h-8 w-px bg-white/10 mx-1 md:mx-2 shrink-0" />
                    <button
                        onClick={() => setIsFallbackOpen(!isFallbackOpen)}
                        disabled={loadingDefaultPolicy}
                        className={cn(
                            "px-3 md:px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase border cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md min-w-[70px] md:min-w-[80px] flex items-center justify-center shrink-0",
                            getPolicyColor(defaultPolicy),
                            loadingDefaultPolicy ? "opacity-70 cursor-wait" : ""
                        )}>
                        {loadingDefaultPolicy ? (
                            <Loader2 size={12} className="md:size-14 animate-spin" />
                        ) : (
                            <span className="truncate">{getPolicyLabel(defaultPolicy)}</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Modal - Simplified Integration */}
            {isDialogOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-xl bg-black/60 animate-in fade-in duration-500">
                    <div className="fixed inset-0" onClick={() => setIsDialogOpen(false)} />
                    <div className="relative w-full max-w-lg glass-card border border-border-color rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="px-10 py-8 border-b border-border-color bg-sidebar-bg">
                            <h3 className="text-xl font-bold text-text-primary tracking-tight">{editingRule ? t('rules.dialog.edit_title') : t('rules.dialog.add_title')}</h3>
                        </div>
                        <div className="p-10 flex flex-col gap-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">{t('rules.dialog.type')}</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["DOMAIN", "DOMAIN_SUFFIX", "DOMAIN_KEYWORD", "IP_CIDR", "GEOIP"] as const).map(type => (
                                        <button key={type} onClick={() => setDialogData({ ...dialogData, type })} className={cn("px-2 py-2.5 rounded-xl text-[10px] font-bold border transition-all truncate uppercase tracking-tighter", dialogData.type === type ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" : "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10")}>{type.replace('_', ' ')}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">{t('rules.dialog.value')}</label>
                                <input value={dialogData.value} onChange={(e) => setDialogData({ ...dialogData, value: e.target.value })} className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-2xl py-3.5 px-5 text-sm text-text-primary focus:outline-none transition-all font-mono" />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">{t('rules.dialog.policy')}</label>
                                <div className="flex flex-wrap gap-2">
                                    {/* Standard Policies */}
                                    <div className="flex bg-card-bg p-1.5 rounded-[1.25rem] border border-border-color flex-1 min-w-[200px]">
                                        {(["PROXY", "DIRECT", "REJECT"] as const).map(policy => (
                                            <button key={policy} onClick={() => setDialogData({ ...dialogData, policy })} className={cn("flex-1 py-2.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest", dialogData.policy === policy ? (policy === "PROXY" ? "bg-purple-500 text-white shadow-lg" : policy === "DIRECT" ? "bg-emerald-500 text-white shadow-lg" : "bg-red-500 text-white shadow-lg") : "text-text-secondary hover:text-text-primary")}>{t(`rules.policies.${policy.toLowerCase()}` as any)}</button>
                                        ))}
                                    </div>
                                    {/* Groups */}
                                    {groups.length > 0 && (
                                        <div className="flex flex-wrap gap-2 w-full">
                                            {groups.map(group => (
                                                <button
                                                    key={group.id}
                                                    onClick={() => setDialogData({ ...dialogData, policy: group.id })}
                                                    className={cn(
                                                        "px-4 py-2 rounded-xl text-[10px] font-bold transition-all border",
                                                        dialogData.policy === group.id
                                                            ? "bg-blue-500 text-white border-blue-500 shadow-lg"
                                                            : "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                                                    )}
                                                >
                                                    {group.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="px-10 py-8 border-t border-border-color bg-sidebar-bg flex justify-end gap-4">
                            <button onClick={() => setIsDialogOpen(false)} disabled={isSavingRule} className="px-6 py-3 rounded-2xl text-xs font-bold text-text-secondary hover:text-text-primary transition-all">{t('rules.dialog.cancel')}</button>
                            <button
                                onClick={handleSaveRule}
                                disabled={isSavingRule}
                                className={cn(
                                    "px-8 py-3 rounded-2xl text-xs font-bold bg-primary hover:bg-primary-hover text-white transition-all shadow-xl shadow-primary/20 scale-100 active:scale-95 flex items-center gap-2",
                                    isSavingRule ? "opacity-70 cursor-wait active:scale-100" : ""
                                )}
                            >
                                {isSavingRule && <Loader2 size={14} className="animate-spin" />}
                                {t('rules.dialog.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rule Policy Context Menu (Fixed Position) */}
            {openRuleMenuId && ruleMenuPos && (
                <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setOpenRuleMenuId(null)} />
                    <div
                        className={cn(
                            "fixed z-[101] w-48 bg-white/90 dark:bg-black/90 backdrop-blur-xl border border-border-color rounded-2xl shadow-xl py-2 overflow-hidden animate-in zoom-in-95 duration-200",
                            ruleMenuPos.bottom ? "origin-bottom-right slide-in-from-bottom-2" : "origin-top-right slide-in-from-top-2"
                        )}
                        style={{
                            top: ruleMenuPos.top,
                            bottom: ruleMenuPos.bottom,
                            right: ruleMenuPos.right
                        }}
                    >
                        <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                            <div className="px-4 py-2 text-[10px] font-bold text-text-tertiary uppercase tracking-widest border-b border-border-color/50 mb-1">{t('rules.dialog.policy')}</div>
                            {(["PROXY", "DIRECT", "REJECT"] as const).map(policy => {
                                const currentRule = rules.find(r => r.id === openRuleMenuId);
                                if (!currentRule) return null;
                                return (
                                    <button
                                        key={policy}
                                        onClick={() => handleUpdateRulePolicy(openRuleMenuId, policy)}
                                        className={cn(
                                            "w-full text-left px-4 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-between font-bold",
                                            currentRule.policy === policy ? "text-primary bg-primary/5" : "text-text-secondary"
                                        )}
                                    >
                                        {t(`rules.policies.${policy.toLowerCase()}` as any)}
                                        {currentRule.policy === policy && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                    </button>
                                )
                            })}

                            {groups.length > 0 && (
                                <>
                                    <div className="px-4 py-2 text-[10px] font-bold text-text-tertiary uppercase tracking-widest border-b border-border-color/50 mt-2 mb-1 border-t">{t('groups.title')}</div>
                                    {groups.map(group => {
                                        const currentRule = rules.find(r => r.id === openRuleMenuId);
                                        if (!currentRule) return null;
                                        return (
                                            <button
                                                key={group.id}
                                                onClick={() => handleUpdateRulePolicy(openRuleMenuId, group.id)}
                                                className={cn(
                                                    "w-full text-left px-4 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-between font-bold",
                                                    currentRule.policy === group.id ? "text-primary bg-primary/5" : "text-text-secondary"
                                                )}
                                            >
                                                <span className="truncate">{group.name}</span>
                                                {currentRule.policy === group.id && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                                            </button>
                                        )
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

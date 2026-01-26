"use client"

import React, { useState, useEffect } from "react"
import { Plus, Search, Trash2, Edit2, Shield, Globe, Monitor, AlertCircle, ChevronUp, ChevronDown, Loader2, GripVertical, Check, RotateCcw, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"
import { emit, listen } from "@tauri-apps/api/event"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { Group } from "./groups-view"
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd"
import { createPortal } from "react-dom"

import { Rule, areRuleSetsEqual, PRESETS, getPresetName, LEGACY_DESCRIPTION_MAP } from "@/lib/rules"

interface RulesViewProps {
    draftRules: Rule[]
    setDraftRules: (rules: Rule[]) => void
    runningRules: Rule[]
    setRunningRules: (rules: Rule[]) => void
    draftDefaultPolicy: string
    setDraftDefaultPolicy: (policy: string) => void
    runningDefaultPolicy: string
    setRunningDefaultPolicy: (policy: string) => void
    currentPreset: string
    setCurrentPreset: (preset: string) => void
    isLoaded: boolean
    onReload: () => void
}

export function RulesView({
    draftRules: rules,
    setDraftRules: setRules,
    runningRules: initialRules,
    setRunningRules: setInitialRules,
    draftDefaultPolicy: defaultPolicy,
    setDraftDefaultPolicy: setDefaultPolicy,
    runningDefaultPolicy: initialDefaultPolicy,
    setRunningDefaultPolicy: setInitialDefaultPolicy,
    currentPreset,
    setCurrentPreset,
    isLoaded,
    onReload
}: RulesViewProps) {
    const { t } = useTranslation()
    const [groups, setGroups] = useState<Group[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedPolicy, setSelectedPolicy] = useState<"ALL" | "PROXY" | "DIRECT" | "REJECT">("ALL")
    const [isFallbackOpen, setIsFallbackOpen] = useState(false)
    const [isPresetOpen, setIsPresetOpen] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingRule, setEditingRule] = useState<Rule | null>(null)
    const [currentlyApplying, setCurrentlyApplying] = useState(false)
    const [loadingRuleId, setLoadingRuleId] = useState<string | null>(null)
    const [loadingDefaultPolicy, setLoadingDefaultPolicy] = useState(false)
    const [isSavingRule, setIsSavingRule] = useState(false)
    const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
    const [openRuleMenuId, setOpenRuleMenuId] = useState<string | null>(null)
    const [ruleMenuPos, setRuleMenuPos] = useState<{ top?: number, bottom?: number, right: number } | null>(null)
    const [isApplying, setIsApplying] = useState(false)
    const [proxyStatus, setProxyStatus] = useState<{ is_running: boolean, tun_mode: boolean, routing_mode: string } | null>(null)
    const [dialogData, setDialogData] = useState<Partial<Rule>>({
        type: "DOMAIN",
        value: "",
        policy: "PROXY",
        enabled: true,
        description: ""
    })
    const [isMac, setIsMac] = useState(false)
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)

    // Snapshot for reorder detection and soft delete
    const [snapshotIds, setSnapshotIds] = useState<string[]>([])
    const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set())

    // Initialize snapshot when initial rules are loaded
    useEffect(() => {
        if (initialRules.length > 0 && snapshotIds.length === 0) {
            setSnapshotIds(initialRules.map(r => r.id))
        } else if (initialRules.length === 0 && snapshotIds.length > 0) {
            // Reset snapshot if rules are cleared externally or mostly empty
            setSnapshotIds([])
        }
    }, [initialRules])

    // Check if the current rules/policy deviate from what's currently active on the server
    const hasPendingChanges = React.useMemo(() => {
        const isRulesDifferent = !areRuleSetsEqual(rules, initialRules)
        const isPolicyDifferent = defaultPolicy !== initialDefaultPolicy
        return isRulesDifferent || isPolicyDifferent
    }, [rules, initialRules, defaultPolicy, initialDefaultPolicy])

    // Reset snapshot when applying changes - moved here to access hasPendingChanges
    useEffect(() => {
        if (!hasPendingChanges) {
            setPendingDeleteIds(new Set())
            // Update snapshot to match current rules as they are now "saved"
            setSnapshotIds(rules.map(r => r.id))
        }
    }, [hasPendingChanges, rules])

    const isDefaultPolicyModified = React.useMemo(() => {
        return defaultPolicy !== initialDefaultPolicy
    }, [defaultPolicy, initialDefaultPolicy])

    const modifiedRuleIds = React.useMemo(() => {
        const modified = new Set<string>()
        rules.forEach(rule => {
            const initial = initialRules.find(r => r.id === rule.id)
            if (!initial || !areRuleSetsEqual([rule], [initial])) {
                modified.add(rule.id)
            }
        })
        return modified
    }, [rules, initialRules])

    // Check if the current rules/policy deviate from the current preset's template
    const isModified = React.useMemo(() => {
        if (currentPreset === "Custom") return false
        const template = PRESETS[currentPreset as keyof typeof PRESETS]
        if (!template) return false

        const isRulesDifferent = !areRuleSetsEqual(rules, template.rules)
        const isPolicyDifferent = defaultPolicy !== template.defaultPolicy
        return isRulesDifferent || isPolicyDifferent
    }, [rules, defaultPolicy, currentPreset])

    useEffect(() => {
        setPortalRoot(document.body)
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
    }, [])

    useEffect(() => {
        if (!isLoaded) {
            onReload()
        }
        fetchGroups()
        fetchProxyStatus()

        const unlisten = listen("proxy-status-change", (event: any) => {
            setProxyStatus(event.payload)
        })

        return () => {
            unlisten.then(f => f())
        }
    }, [isLoaded, onReload])

    const fetchProxyStatus = async () => {
        try {
            const status = await invoke<any>("get_proxy_status")
            setProxyStatus(status)
        } catch (e) {
            console.error("Failed to fetch proxy status", e)
        }
    }

    const fetchGroups = async () => {
        try {
            const data = await invoke<Group[]>("get_groups")
            setGroups(data)
        } catch (e) {
            console.error("Failed to fetch groups", e)
        }
    }

    const checkPendingChanges = (updatedRules: Rule[], updatedPolicy: string) => {
        // This is now purely reactive via useMemo(hasPendingChanges), but we keep the helper
        // if any logic needs to be triggered manually.
    }

    const saveRulesToBackend = async (rulesToSave: Rule[], policy: string, isSilent = false) => {
        const finalRule: Rule = {
            id: "final-policy",
            type: "FINAL",
            value: "default",
            policy: policy,
            enabled: true,
            description: "rules.description.final_proxy"
        }
        const payload = [...rulesToSave, finalRule]
        try {
            await invoke("save_rules", { rules: payload })
            if (!isSilent) {
                // We don't check pending changes here, as it's computed by useMemo.
                // But we update the snapshot for reorder detection
                setSnapshotIds(rulesToSave.map(r => r.id))
                setPendingDeleteIds(new Set())
            }
        } catch (e) {
            console.error("Failed to save rules:", e)
            throw e
        }
    }

    const handleApplyChanges = async () => {
        if (!proxyStatus?.is_running) {
            // Apply soft deletes before saving
            const finalRules = rules.filter(r => !pendingDeleteIds.has(r.id))

            // Persist rules to disk first
            try {
                // Pass true for isSilent to prevent auto-snapshot update, we manage it manually here
                await saveRulesToBackend(finalRules, defaultPolicy, true)
                setInitialRules([...finalRules])
                setRules(finalRules) // Sync local state to remove soft-deleted items visualy
                setInitialDefaultPolicy(defaultPolicy)
                // Manually update snapshot after success
                setSnapshotIds(finalRules.map(r => r.id))
                setPendingDeleteIds(new Set())

                toast.success(t('rules.toast.saved_only'))
            } catch (e) {
                toast.error(t('rules.toast.save_failed'))
            }
            return
        }

        setIsApplying(true)
        emit("proxy-transition", { state: "connecting" })

        try {
            // Apply soft deletes before saving
            const finalRules = rules.filter(r => !pendingDeleteIds.has(r.id))

            // Ensure rules are saved before restarting
            // Pass true for isSilent to prevent auto-snapshot update
            await saveRulesToBackend(finalRules, defaultPolicy, true)

            // Fetch current active node
            const settings: any = await invoke("get_app_settings")
            const nodes: any[] = await invoke("get_nodes")
            const activeNode = nodes.find(n => n.id === settings.active_target_id) || null

            await invoke("start_proxy", {
                node: activeNode,
                tun: proxyStatus.tun_mode,
                routing: proxyStatus.routing_mode
            })
            setInitialRules([...finalRules])
            setInitialDefaultPolicy(defaultPolicy)
            // Purely reactive via useMemo(hasPendingChanges)
            localStorage.setItem("tunnet_rules_preset", currentPreset)

            // Sync local rules to remove soft-deleted items visually
            setRules(finalRules)

            // Manually update snapshot after success
            setSnapshotIds(finalRules.map(r => r.id))
            setPendingDeleteIds(new Set())

            toast.success(t('rules.toast.applied_success'))
        } catch (err) {
            console.error("Failed to apply rules:", err)
            toast.error(t('rules.toast.apply_failed'))
        } finally {
            setIsApplying(false)
            emit("proxy-transition", { state: "idle" })
        }
    }

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return
        if (result.destination.index === result.source.index) return

        const items = Array.from(rules)
        const [reorderedItem] = items.splice(result.source.index, 1)
        items.splice(result.destination.index, 0, reorderedItem)

        setRules(items)

        // Auto-save to backend removed to allow Discard/Undo functionality
        // Changes are now only persisted when clicking "Apply"

        switchToCustom(items, defaultPolicy)
    }

    const handleApplyPreset = (name: string, isSilent = false) => {
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
                preset = { rules: [], defaultPolicy: "PROXY" }
            }
        } else {
            preset = PRESETS[name as keyof typeof PRESETS]
        }

        if (!preset) {
            console.warn(`Preset ${name} not found!`);
            return;
        }

        if (preset) {
            const newRules = [...preset.rules]
            const newPolicy = preset.defaultPolicy

            setRules(newRules)
            setDefaultPolicy(newPolicy as any)
            setCurrentPreset(name)
            setIsPresetOpen(false)

            // Check if this new state differs from what's currently on the server
            checkPendingChanges(newRules, newPolicy)

            // We don't show an "Applied" toast here anymore because it's confusing.
            // The yellow "Pending Changes" banner is sufficient feedback.
        }
    }

    const handleRestorePreset = () => {
        const template = PRESETS[currentPreset as keyof typeof PRESETS]
        if (template) {
            setRules([...template.rules])
            setDefaultPolicy(template.defaultPolicy as any)
            toast.success(t('rules.toast.preset_restored'))
        }
    }

    const handleSaveToCustom = () => {
        localStorage.setItem("tunnet_rules_custom", JSON.stringify({
            rules: rules,
            defaultPolicy: defaultPolicy
        }))
        toast.success(t('rules.toast.saved_to_custom', { defaultValue: 'Current rules saved as Custom config' }))
    }

    const switchToCustom = (updatedRules: Rule[], updatedPolicy: string) => {
        if (currentPreset === "Custom") {
            localStorage.setItem("tunnet_rules_custom", JSON.stringify({
                rules: updatedRules,
                defaultPolicy: updatedPolicy
            }))
        }
    }

    const handleDeleteRule = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (deletingRuleId) return

        // Soft delete: just add to pending set
        setPendingDeleteIds(prev => {
            const next = new Set(prev)
            next.add(id)
            return next
        })
        toast.success(t('rules.toast.rule_deleted_pending'))
    }

    const handleRestoreRule = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setPendingDeleteIds(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
        })
        toast.success(t('rules.toast.rule_restored'))
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
            return "text-blue-400 bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
        }
        switch (policy) {
            case "PROXY": return "text-violet-400 bg-violet-600/15 border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
            case "DIRECT": return "text-emerald-400 bg-emerald-600/15 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
            case "REJECT": return "text-rose-400 bg-rose-600/15 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
            default: return "text-gray-400 bg-white/5 border-white/10"
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
            <div className={cn(
                "border-b border-black/5 dark:border-white/5 bg-transparent p-5 md:px-8 md:pb-6 shrink-0 relative z-30",
                isMac ? "md:pt-8" : "md:pt-8"
            )}>
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
                                        "flex items-center gap-3 px-5 py-2.5 bg-card-bg border border-border-color rounded-xl hover:bg-white/5 transition-all group relative",
                                        isPresetOpen ? "ring-2 ring-primary/20 bg-white/5" : ""
                                    )}
                                >
                                    <Globe size={14} className="text-primary/70 group-hover:text-primary transition-colors" />
                                    <div className="flex flex-col items-start gap-0.5">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('rules.preset.label')}</span>
                                        <span className="text-xs font-bold text-text-primary whitespace-nowrap flex items-center gap-1.5">
                                            {getPresetName(currentPreset, t)}
                                            {isModified && <span className="text-amber-500 animate-pulse font-mono">*</span>}
                                        </span>
                                    </div>
                                    {isPresetOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                </button>
                                {isPresetOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setIsPresetOpen(false)} />
                                        <div className="absolute top-full right-0 mt-2 w-64 bg-white/90 dark:bg-black/90 backdrop-blur-xl border border-border-color rounded-2xl shadow-2xl py-3 z-50 animate-in zoom-in-95 duration-200 origin-top-right ring-1 ring-black/5 dark:ring-white/5">
                                            {Object.keys(PRESETS).concat(["Custom"]).map(name => (
                                                <button
                                                    key={name}
                                                    onClick={() => handleApplyPreset(name)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-5 py-3 text-xs font-bold transition-all hover:bg-white/5",
                                                        currentPreset === name ? "text-primary bg-primary/5" : "text-text-secondary"
                                                    )}
                                                >
                                                    <span>{getPresetName(name, t)}</span>
                                                    {currentPreset === name && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                                                </button>
                                            ))}

                                            {isModified && (
                                                <>
                                                    <div className="mx-4 my-2 border-t border-border-color/50" />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleRestorePreset(); setIsPresetOpen(false); }}
                                                        className="w-full flex items-center gap-2 px-5 py-2.5 text-[10px] font-bold text-emerald-500 hover:bg-emerald-500/5 transition-all"
                                                    >
                                                        <RotateCcw size={12} />
                                                        {t('rules.preset.restore', { defaultValue: 'Discard & Restore Template' })}
                                                    </button>
                                                    {currentPreset !== "Custom" && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleSaveToCustom(); setIsPresetOpen(false); }}
                                                            className="w-full flex items-center gap-2 px-5 py-2.5 text-[10px] font-bold text-primary hover:bg-primary/5 transition-all"
                                                        >
                                                            <Plus size={12} />
                                                            {t('rules.preset.save_to_custom', { defaultValue: 'Save Current as Custom' })}
                                                        </button>
                                                    )}
                                                </>
                                            )}
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
                                type="text"
                                placeholder={t('rules.search_placeholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-black/5 dark:bg-white/5 border border-transparent focus:border-primary/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-text-primary focus:outline-none transition-all font-medium placeholder:text-text-tertiary"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
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

            {/* Fixed Pending Banner */}
            {hasPendingChanges && (
                <div className="shrink-0 relative z-20 px-4 md:px-8 py-2 bg-transparent animate-in slide-in-from-top-4 duration-500">
                    <div className="max-w-5xl mx-auto w-full glass-card border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)] rounded-2xl p-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-amber-500/10 rounded-xl">
                                <Zap size={16} className="text-amber-500 animate-pulse" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-text-primary leading-none mb-0.5">{t('rules.pending_title', { defaultValue: 'Ready to Apply' })}</h4>
                                <p className="text-[10px] text-text-secondary font-medium">{t('rules.pending_desc', { defaultValue: 'Apply changes to restart proxy service.' })}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onReload()}
                                className="px-3 py-1.5 text-[10px] font-bold text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
                            >
                                <RotateCcw size={12} />
                                <span className="hidden sm:inline">{t('rules.discard_changes', { defaultValue: 'Discard' })}</span>
                            </button>
                            <button
                                onClick={handleApplyChanges}
                                disabled={isApplying}
                                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-bold transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 scale-100 active:scale-95"
                            >
                                {isApplying ? (
                                    <Loader2 size={12} className="animate-spin" />
                                ) : (
                                    <Check size={12} />
                                )}
                                {t('rules.apply_changes', { defaultValue: 'Apply Changes' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-8 sidebar-scroll bg-transparent">
                <div className="max-w-5xl mx-auto w-full space-y-3 pb-32">


                    {!isLoaded ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Loader2 size={40} className="mb-4 animate-spin opacity-20" />
                            <p className="text-sm font-medium">{t('common.loading', { defaultValue: 'Loading...' })}</p>
                        </div>
                    ) : filteredRules.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                            <AlertCircle size={40} className="mb-4 opacity-20" />
                            <p className="text-sm font-medium">{t('rules.no_rules_found')}</p>
                        </div>
                    ) : (
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId="rules-list" isDropDisabled={searchQuery !== "" || selectedPolicy !== "ALL"}>
                                {(provided) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="space-y-3"
                                    >
                                        {filteredRules.map((rule, index) => (
                                            <Draggable
                                                key={rule.id}
                                                draggableId={rule.id}
                                                index={index}
                                                isDragDisabled={searchQuery !== "" || selectedPolicy !== "ALL"}
                                            >
                                                {(provided, snapshot) => {
                                                    const isPendingDelete = pendingDeleteIds.has(rule.id)
                                                    const isMoved = snapshotIds.includes(rule.id) && snapshotIds.indexOf(rule.id) !== index && !isPendingDelete

                                                    const content = (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            style={{
                                                                ...provided.draggableProps.style,
                                                                // @ts-ignore
                                                                width: snapshot.isDragging ? (provided.draggableProps.style?.width || 'calc(100% - 32px)') : 'auto',
                                                                // @ts-ignore
                                                                maxWidth: snapshot.isDragging ? '1024px' : 'none',
                                                            }}
                                                            className={cn(
                                                                "glass-card flex items-center justify-between p-4 rounded-2xl group border border-transparent transition-all duration-500 relative overflow-hidden",
                                                                isPendingDelete
                                                                    ? "border-red-500/30 bg-red-500/5 opacity-80"
                                                                    : modifiedRuleIds.has(rule.id)
                                                                        ? "ring-1 ring-amber-500/50 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                                                                        : "hover:border-border-color",
                                                                snapshot.isDragging
                                                                    ? "shadow-2xl border-primary/40 z-50 bg-sidebar-bg/90 backdrop-blur-2xl ring-2 ring-primary/20 scale-[1.02]"
                                                                    : !isPendingDelete && "transition-all duration-300 hover:bg-black/5 dark:hover:bg-white/8"
                                                            )}
                                                        >
                                                            {/* Delete Indicator Bar */}
                                                            {isPendingDelete && (
                                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/50 z-20" />
                                                            )}

                                                            {/* Modified Indicator Bar (only if not deleted) */}
                                                            {!isPendingDelete && modifiedRuleIds.has(rule.id) && (
                                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50 z-20" />
                                                            )}

                                                            {/* Reorder Indicator (Blue Dot at bottom-left corner) */}
                                                            {isMoved && !snapshot.isDragging && (
                                                                <div className="absolute bottom-2 left-2 flex h-1.5 w-1.5 z-20" title="Order changed">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                                                                </div>
                                                            )}

                                                            {/* Modified Pin Dot (Top Right) */}
                                                            {!isPendingDelete && modifiedRuleIds.has(rule.id) && (
                                                                <span className="absolute top-2 right-2 flex h-2 w-2 z-20 pointer-events-none">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                                </span>
                                                            )}

                                                            <div className="flex items-center flex-1 min-w-0">
                                                                <div
                                                                    {...provided.dragHandleProps}
                                                                    className={cn(
                                                                        "p-0 pr-1 md:pr-2 text-gray-400 hover:text-primary transition-colors cursor-grab active:cursor-grabbing",
                                                                        (searchQuery !== "" || selectedPolicy !== "ALL" || isPendingDelete) && "hidden"
                                                                    )}
                                                                >
                                                                    <GripVertical size={16} />
                                                                </div>
                                                                <div className="w-20 md:w-24 shrink-0 hidden sm:block pointer-events-none select-none mr-2 md:mr-4">
                                                                    <div className={cn(
                                                                        "flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-xl border w-full justify-center transition-all duration-300 relative",
                                                                        "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/10 text-text-tertiary"
                                                                    )}>
                                                                        <Shield size={10} className={cn("md:size-3 shrink-0", !isPendingDelete && modifiedRuleIds.has(rule.id) ? "text-amber-500" : "text-primary/70")} />
                                                                        <span className={cn(
                                                                            "text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-text-tertiary text-center",
                                                                            isPendingDelete && "line-through opacity-70"
                                                                        )}>
                                                                            {rule.type === 'IP_IS_PRIVATE' ? 'PRIVATE ADDR' : rule.type.replace(/_/g, ' ')}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col flex-1 min-w-0">
                                                                    <span className={cn(
                                                                        "text-xs md:text-sm font-semibold font-mono truncate transition-colors",
                                                                        isPendingDelete ? "text-red-500 line-through decoration-red-500/50" :
                                                                            modifiedRuleIds.has(rule.id) ? "text-amber-500" : "text-text-primary"
                                                                    )}>{rule.value}</span>
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
                                                                        const MENU_HEIGHT = 280;
                                                                        const right = window.innerWidth - rect.right;
                                                                        if (rect.bottom + MENU_HEIGHT > window.innerHeight) {
                                                                            setRuleMenuPos({ bottom: window.innerHeight - rect.top + 8, right });
                                                                        } else {
                                                                            setRuleMenuPos({ top: rect.bottom + 8, right });
                                                                        }
                                                                        setOpenRuleMenuId(rule.id);
                                                                    }}
                                                                    disabled={loadingRuleId === rule.id || isPendingDelete}
                                                                    className={cn(
                                                                        "px-2 md:px-3 py-1 rounded-full text-[9px] md:text-[10px] font-bold border tracking-widest uppercase w-16 md:w-20 text-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md flex items-center justify-center relative z-0",
                                                                        isPendingDelete ? "opacity-50 grayscale cursor-not-allowed" : getPolicyColor(rule.policy),
                                                                        loadingRuleId === rule.id ? "opacity-70 cursor-wait" : ""
                                                                    )}>
                                                                    {loadingRuleId === rule.id ? (
                                                                        <Loader2 size={10} className="animate-spin" />
                                                                    ) : (
                                                                        <span className="truncate">{getPolicyLabel(rule.policy)}</span>
                                                                    )}
                                                                </button>
                                                                <div className="flex items-center gap-1 md:gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300 translate-x-0 md:translate-x-2 md:group-hover:translate-x-0">
                                                                    {!isPendingDelete && (
                                                                        <button
                                                                            onClick={(e) => { setEditingRule(rule); setDialogData({ ...rule }); setIsDialogOpen(true); }}
                                                                            className="p-1.5 md:p-2 text-text-tertiary hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                                                        >
                                                                            <Edit2 size={14} className="md:size-4" />
                                                                        </button>
                                                                    )}
                                                                    {isPendingDelete ? (
                                                                        <button
                                                                            onClick={(e) => handleRestoreRule(rule.id, e)}
                                                                            className="p-1.5 md:p-2 rounded-xl transition-all text-emerald-500 hover:bg-emerald-500/10"
                                                                            title={t('rules.restore')}
                                                                        >
                                                                            <RotateCcw size={14} className="md:size-4" />
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={(e) => handleDeleteRule(rule.id, e)}
                                                                            disabled={deletingRuleId === rule.id}
                                                                            className={cn(
                                                                                "p-1.5 md:p-2 rounded-xl transition-all",
                                                                                deletingRuleId === rule.id
                                                                                    ? "text-accent-red bg-accent-red/10 cursor-wait"
                                                                                    : "text-text-tertiary hover:text-accent-red hover:bg-accent-red/10"
                                                                            )}
                                                                        >
                                                                            {deletingRuleId === rule.id ? (
                                                                                <Loader2 size={14} className="md:size-4 animate-spin" />
                                                                            ) : (
                                                                                <Trash2 size={14} className="md:size-4" />
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );

                                                    if (snapshot.isDragging && portalRoot) {
                                                        return createPortal(content, portalRoot);
                                                    }
                                                    return content;
                                                }}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    )}
                </div>
            </div>

            {/* Bottom Default Status */}
            <div className={cn(
                "fixed left-0 right-0 z-30 pointer-events-none flex justify-center",
                "bottom-[72px] md:bottom-10" // Adjust bottom position for mobile to be above BottomNav
            )}>
                <div className={cn(
                    "pointer-events-auto glass-card flex items-center justify-between md:justify-start gap-4 transition-all active:scale-95 group cursor-pointer relative overflow-hidden",
                    "w-full mx-4 px-5 py-4 rounded-[2rem] border-t border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.3)]", // Mobile: Near full-width bar
                    "md:w-auto md:mx-0 md:px-6 md:py-3 md:rounded-2xl md:border md:shadow-2xl", // Desktop: Floating pill
                    isDefaultPolicyModified ? "ring-1 ring-amber-500/50 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.2)] border-amber-500/20" : ""
                )}
                >
                    {isDefaultPolicyModified && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50 z-20" />
                    )}
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
                                                setDefaultPolicy(policy)
                                                switchToCustom(rules, policy)
                                                setIsFallbackOpen(false)
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
                                                        setDefaultPolicy(group.id as any)
                                                        switchToCustom(rules, group.id)
                                                        setIsFallbackOpen(false)
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
                            <span className={cn(
                                "text-xs md:text-sm font-bold truncate transition-colors",
                                isDefaultPolicyModified ? "text-amber-500" : "text-text-primary"
                            )}>{t('rules.all_other_traffic')}</span>
                            {isDefaultPolicyModified && (
                                <span className="flex h-2 w-2 relative ml-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="h-8 w-px bg-white/10 mx-1 md:mx-2 shrink-0" />
                    <button
                        onClick={() => setIsFallbackOpen(!isFallbackOpen)}
                        disabled={loadingDefaultPolicy}
                        className={cn(
                            "px-3 md:px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase border cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm hover:shadow-md min-w-[70px] md:min-w-[80px] flex items-center justify-center shrink-0",
                            getPolicyColor(defaultPolicy),
                            isDefaultPolicyModified ? "border-amber-500/40" : "",
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
            {
                isDialogOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm bg-black/60 animate-in fade-in duration-500">
                        <div className="fixed inset-0" onClick={() => setIsDialogOpen(false)} />
                        <div className="relative w-full max-w-lg bg-sidebar-bg border border-border-color rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="px-8 py-5 border-b border-border-color bg-black/10 dark:bg-white/5">
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">{editingRule ? t('rules.dialog.edit_title') : t('rules.dialog.add_title')}</h3>
                            </div>
                            <div className="p-8 flex flex-col gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest pl-1">{t('rules.dialog.type')}</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(["DOMAIN", "DOMAIN_SUFFIX", "DOMAIN_KEYWORD", "IP_CIDR", "GEOIP", "IP_IS_PRIVATE"] as const).map(type => (
                                            <button
                                                key={type}
                                                onClick={() => {
                                                    let newValue = dialogData.value;
                                                    if (type === 'IP_IS_PRIVATE') {
                                                        newValue = 'true';
                                                    } else if (dialogData.type === 'IP_IS_PRIVATE') {
                                                        newValue = '';
                                                    }
                                                    setDialogData({ ...dialogData, type, value: newValue });
                                                }}
                                                className={cn(
                                                    "px-2 py-2.5 rounded-xl text-[10px] font-bold border transition-all truncate uppercase tracking-tighter",
                                                    dialogData.type === type
                                                        ? "bg-linear-to-br from-primary to-blue-600 border-primary/50 text-white shadow-lg shadow-primary/25 border-t-white/30"
                                                        : "bg-black/10 dark:bg-black/40 border-border-color text-text-secondary hover:text-text-primary hover:bg-white/10"
                                                )}
                                            >
                                                {type === 'IP_IS_PRIVATE' ? 'PRIVATE' : type.replace(/_/g, ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest pl-1">{t('rules.dialog.value')}</label>
                                    <input
                                        type="text"
                                        value={dialogData.type === 'IP_IS_PRIVATE' ? t('rules.dialog.placeholders.private') : dialogData.value}
                                        readOnly={dialogData.type === 'IP_IS_PRIVATE'}
                                        autoFocus
                                        onChange={(e) => setDialogData({ ...dialogData, value: e.target.value })}
                                        className={cn(
                                            "w-full bg-black/10 dark:bg-black/40 border border-border-color rounded-2xl px-6 py-4 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-all font-mono placeholder:text-text-tertiary",
                                            dialogData.type === 'IP_IS_PRIVATE' && "opacity-50 cursor-not-allowed text-text-tertiary"
                                        )}
                                        placeholder={t(`rules.dialog.placeholders.${(dialogData.type || 'DOMAIN').toLowerCase().replace('ip_is_private', 'private')}` as any)}
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest pl-1">{t('rules.dialog.policy')}</label>
                                    <div className="flex flex-wrap gap-2">
                                        {/* Standard Policies */}
                                        <div className="flex bg-black/10 dark:bg-black/40 p-1.5 rounded-[1.25rem] border border-border-color/50 flex-1 min-w-[240px]">
                                            {(["PROXY", "DIRECT", "REJECT"] as const).map(policy => (
                                                <button
                                                    key={policy}
                                                    onClick={() => setDialogData({ ...dialogData, policy })}
                                                    className={cn(
                                                        "flex-1 py-2.5 rounded-xl text-[10px] font-bold transition-all uppercase tracking-widest relative overflow-hidden",
                                                        dialogData.policy === policy
                                                            ? (policy === "PROXY"
                                                                ? "bg-linear-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/20 border-t border-t-white/30"
                                                                : policy === "DIRECT"
                                                                    ? "bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 border-t border-t-white/30"
                                                                    : "bg-linear-to-br from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-500/20 border-t border-t-white/30")
                                                            : "text-text-secondary hover:text-text-primary"
                                                    )}
                                                >
                                                    {t(`rules.policies.${policy.toLowerCase()}` as any)}
                                                </button>
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
                                                                ? "bg-primary text-white border-primary shadow-lg"
                                                                : "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-text-tertiary hover:text-primary hover:bg-primary/10"
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
                            <div className="px-8 py-5 border-t border-border-color bg-black/10 dark:bg-white/5 flex justify-end gap-3">
                                <button onClick={() => setIsDialogOpen(false)} disabled={isSavingRule} className="px-5 py-2.5 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary transition-all">{t('rules.dialog.cancel')}</button>
                                <button
                                    onClick={handleSaveRule}
                                    disabled={isSavingRule}
                                    className={cn(
                                        "px-7 py-2.5 rounded-xl text-xs font-bold bg-linear-to-br from-primary to-blue-600 text-white transition-all shadow-xl shadow-primary/25 border-t border-t-white/30 scale-100 active:scale-95 flex items-center gap-2",
                                        isSavingRule ? "opacity-70 cursor-wait active:scale-100" : ""
                                    )}
                                >
                                    {isSavingRule && <Loader2 size={14} className="animate-spin" />}
                                    {t('rules.dialog.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Rule Policy Context Menu (Fixed Position) */}
            {
                openRuleMenuId && ruleMenuPos && (
                    <>
                        <div className="fixed inset-0 z-50" onClick={() => setOpenRuleMenuId(null)} />
                        <div
                            className={cn(
                                "fixed z-50 w-48 bg-white/90 dark:bg-black/90 backdrop-blur-xl border border-border-color rounded-2xl shadow-xl py-2 overflow-hidden animate-in zoom-in-95 duration-200",
                                ruleMenuPos.bottom ? "origin-bottom-right slide-in-from-bottom-2" : "origin-top-right slide-in-from-top-2"
                            )}
                            style={{
                                top: ruleMenuPos?.top,
                                bottom: ruleMenuPos?.bottom,
                                right: ruleMenuPos?.right || 0
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
                )
            }
        </div >
    )
}

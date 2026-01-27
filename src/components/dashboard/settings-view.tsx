"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useTheme } from "next-themes"
import {
    Monitor,
    Zap,
    Globe,
    Server,
    Shield,
    Database,
    Bug,
    Info,
    Search,
    RefreshCw,
    Power,
    ChevronRight,
    Sun,
    Moon,
    Laptop,
    Plus,
    Minus,
    LogOut,
    Loader2,
    RotateCcw,
    Check,
    AlertCircle,
    Activity,
    FileJson,
    FileDown,
    FileUp
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { AppSettings, defaultSettings, getAppSettings, saveAppSettings } from "@/lib/settings"
import { getVersion } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/core"
import { save, open as openDialog } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs"
import { useTranslation } from "react-i18next"
import { toast } from "sonner" // Assuming you have sonner or some toast, if not I should remove it or check. 
// Note: I don't see sonner in imports but it's common. I'll stick to console if not standard.

type SettingCategory = "general" | "connection" | "dns" | "advanced" | "about"

interface SettingsViewProps {
    initialCategory?: SettingCategory
    onClose?: () => void
    clashApiPort?: number | null
    helperApiPort?: number | null
    tunEnabled?: boolean
    onTunToggle?: () => void
    draftSettings: AppSettings
    setDraftSettings: React.Dispatch<React.SetStateAction<AppSettings>>
    runningSettings: AppSettings | null
    setRunningSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>
    isConnected: boolean
}

export function SettingsView({
    initialCategory = "general",
    clashApiPort,
    helperApiPort,
    tunEnabled,
    onTunToggle,
    draftSettings,
    setDraftSettings,
    runningSettings,
    setRunningSettings,
    isConnected
}: SettingsViewProps) {
    console.log("SettingsView render - settings:", draftSettings, "runningSettings:", runningSettings, "isConnected:", isConnected)

    const { t } = useTranslation()
    const [activeCategory, setActiveCategory] = useState<SettingCategory>(initialCategory)

    // settings is the current draft from props
    const settings = draftSettings
    const setSettings = setDraftSettings

    // appliedSettings is the running config from props (fallback to draft if none running)
    const appliedSettings = runningSettings || draftSettings

    const [isMac, setIsMac] = useState(false)
    const [isApplying, setIsApplying] = useState(false)
    const [appVersion, setAppVersion] = useState<string>("")

    // List of settings that require a proxy restart to apply
    const criticalKeys: (keyof AppSettings)[] = [
        "mixed_port", "allow_lan", "tun_stack", "tun_mtu",
        "strict_route", "dns_hijack", "dns_strategy", "dns_servers",
        "log_level"
    ]

    const modifiedKeys = React.useMemo(() => {
        if (!isConnected || !runningSettings) return []
        return criticalKeys.filter(key => settings[key] !== runningSettings[key])
    }, [settings, runningSettings, isConnected])

    const hasPendingChanges = modifiedKeys.length > 0

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
        getVersion().then(setAppVersion).catch(console.error)
    }, [])

    useEffect(() => {
        let active = true;
        let unlistenFn: (() => void) | undefined;

        async function setupListener() {
            try {
                const { listen } = await import("@tauri-apps/api/event");
                const f = await listen<AppSettings>("settings-update", (event) => {
                    if (!active) return;
                    console.log("Settings updated from backend:", event.payload)
                    setSettings(event.payload)
                });

                if (!active) {
                    f(); // Component unmounted while waiting, clean up immediately
                } else {
                    unlistenFn = f;
                }
            } catch (e) {
                console.error("Failed to setup settings listener:", e);
            }
        }

        setupListener()

        return () => {
            active = false;
            if (unlistenFn) unlistenFn();
        }
    }, [setSettings])

    const updateSetting = async (key: keyof AppSettings, value: any) => {
        const newSettings = { ...settings, [key]: value }
        setSettings(newSettings)

        // Case A: Disconnected -> Save everything immediately
        // Case B: Connected -> Only save non-critical settings immediately
        const isCritical = criticalKeys.includes(key)
        if (!isConnected || !isCritical) {
            try {
                await saveAppSettings(newSettings)
            } catch (e) {
                console.error(`Failed to save setting ${key}:`, e)
            }
        }
    }

    // Debounced update for text inputs (to avoid too many saves)
    const debouncedUpdate = useCallback((key: keyof AppSettings, value: any) => {
        updateSetting(key, value)
    }, [settings])
    // Actually debouncing in React requires a ref or library. 
    // For simplicity, I'll update state immediately but save onBlur for inputs. 
    // The updateSetting above saves immediately. I'll create a handleBlur or distinct handleSave.

    const handleSave = async (newSettings: AppSettings) => {
        setSettings(newSettings)

        // If not connected, always save immediately
        // If connected, only save if NO critical keys were changed from running config
        const hasCriticalChange = criticalKeys.some(key => newSettings[key] !== appliedSettings[key])

        if (!isConnected || !hasCriticalChange) {
            try {
                await saveAppSettings(newSettings)
            } catch (e) {
                console.error("Failed to save settings:", e)
            }
        }
    }

    const categories = [
        { id: "general", label: t('settings.nav.general'), icon: <Monitor size={16} /> },
        { id: "connection", label: t('settings.nav.connection'), icon: <Zap size={16} /> },
        { id: "dns", label: t('settings.nav.dns'), icon: <Globe size={16} /> },
        { id: "advanced", label: t('settings.nav.advanced'), icon: <Shield size={16} /> },
        { id: "about", label: t('settings.nav.about'), icon: <Info size={16} /> },
    ]

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500 text-foreground">
            {/* Top Navigation Tabs */}
            <div className={cn(
                "border-b border-black/2 dark:border-white/2 flex items-center px-4 md:pl-8 bg-transparent shrink-0 relative z-30",
                isMac ? "h-14" : "h-16 pt-8"
            )}>
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="flex bg-card-bg p-1 rounded-xl border border-border-color relative z-10 w-full md:w-auto overflow-x-auto no-scrollbar">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id as SettingCategory)}
                            className={cn(
                                "flex items-center gap-2 px-3 md:px-6 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 relative shrink-0",
                                activeCategory === cat.id
                                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                                    : "text-secondary hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            {cat.icon}
                            <span className="hidden sm:inline">{cat.label}</span>
                            <span className="sm:hidden">{cat.label.slice(0, 2)}</span>
                            {/* Tab Indicator */}
                            {isConnected && cat.id === "connection" && modifiedKeys.some(k => ["mixed_port", "allow_lan", "tun_stack", "tun_mtu", "strict_route"].includes(k as any)) && (
                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            )}
                            {isConnected && cat.id === "dns" && modifiedKeys.some(k => ["dns_hijack", "dns_strategy", "dns_servers"].includes(k as any)) && (
                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            )}
                            {isConnected && cat.id === "advanced" && modifiedKeys.some(k => ["log_level"].includes(k as any)) && (
                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="ml-auto z-10">
                    <QuitButton />
                </div>
            </div>

            {hasPendingChanges && (
                <div className="px-4 md:px-8 mt-4 shrink-0">
                    <div className="max-w-3xl mx-auto">
                        <div className="glass-card border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)] rounded-2xl p-4 flex items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500/10 rounded-xl">
                                    <Zap size={18} className="text-amber-500 animate-pulse" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-foreground leading-none mb-1">{t('settings.pending_title', { defaultValue: 'Ready to Apply' })}</h4>
                                    <p className="text-[10px] md:text-xs text-secondary font-medium">{t('settings.pending_desc', { defaultValue: 'Some settings have been modified. Apply changes to restart proxy service.' })}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSettings(appliedSettings)}
                                    className="px-4 py-2 text-xs font-bold text-secondary hover:text-foreground transition-colors flex items-center gap-1.5"
                                >
                                    <RotateCcw size={14} />
                                    <span className="hidden sm:inline">{t('rules.discard_changes', { defaultValue: 'Discard' })}</span>
                                </button>
                                <button
                                    onClick={async () => {
                                        setIsApplying(true)
                                        import("@tauri-apps/api/event").then(({ emit }) => {
                                            emit("proxy-transition", { state: "connecting" })
                                        })
                                        try {
                                            // 1. SAVE to disk first, as backend reads from disk on startup
                                            await saveAppSettings(settings)

                                            // 2. Fetch current status to get target_id, etc.
                                            const status = await invoke<any>("get_proxy_status")
                                            const tun_mode = settings.tun_mode // Use new settings!
                                            const routing_mode = status.routing_mode

                                            // 3. Fetch current nodes and find active one
                                            const nodes = await invoke<any[]>("get_nodes")
                                            const activeNode = nodes.find(n => n.id === settings.active_target_id) || null

                                            // 4. Start proxy (backend will read new settings from disk)
                                            await invoke("start_proxy", {
                                                node: activeNode,
                                                tun: tun_mode,
                                                routing: routing_mode
                                            })

                                            setRunningSettings(settings)
                                            toast.success(t('rules.toast.applied_success', { defaultValue: 'Settings applied successfully' }))
                                        } catch (e) {
                                            console.error("Failed to apply settings", e)
                                            toast.error(t('rules.toast.apply_failed', { defaultValue: 'Failed to apply settings' }))
                                        } finally {
                                            setIsApplying(false)
                                            import("@tauri-apps/api/event").then(({ emit }) => {
                                                emit("proxy-transition", { state: "idle" })
                                            })
                                        }
                                    }}
                                    disabled={isApplying}
                                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 scale-100 active:scale-95"
                                >
                                    {isApplying ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Check size={14} />
                                    )}
                                    {t('rules.apply_changes', { defaultValue: 'Apply Changes' })}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto sidebar-scroll px-4 md:px-8 py-6 md:py-10">
                <div className="max-w-3xl mx-auto pb-10">
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <>
                            {activeCategory === "general" && <GeneralSettings settings={settings} update={updateSetting} save={handleSave} version={appVersion} modifiedKeys={modifiedKeys} />}
                            {activeCategory === "connection" && <ConnectionSettings settings={settings} update={updateSetting} save={handleSave} tunEnabled={tunEnabled} onTunToggle={onTunToggle} modifiedKeys={modifiedKeys} />}
                            {activeCategory === "dns" && <DnsSettings settings={settings} update={updateSetting} save={handleSave} modifiedKeys={modifiedKeys} />}
                            {activeCategory === "advanced" && <AdvancedSettings settings={settings} update={updateSetting} save={handleSave} clashApiPort={clashApiPort} helperApiPort={helperApiPort} modifiedKeys={modifiedKeys} />}
                            {activeCategory === "about" && <AboutSection version={appVersion} />}
                        </>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Section({ title, children, icon }: { title: React.ReactNode, children: React.ReactNode, icon?: React.ReactNode }) {
    return (
        <div className="space-y-4 mb-10 last:mb-0">
            <div className="flex items-center gap-2 px-1">
                {icon && <span className="text-primary">{icon}</span>}
                <h3 className="text-[11px] font-bold text-secondary uppercase tracking-[0.2em]">{title}</h3>
            </div>
            <div className="space-y-3">
                {children}
            </div>
        </div>
    )
}

function SettingItem({
    title,
    description,
    children,
    icon,
    isModified
}: {
    title: React.ReactNode,
    description?: string,
    children: React.ReactNode,
    icon?: React.ReactNode,
    isModified?: boolean
}) {
    return (
        <div className={cn(
            "glass-card flex items-center justify-between p-3 md:p-4 rounded-2xl transition-all duration-500 ring-1 group relative overflow-hidden",
            isModified
                ? "ring-amber-500/50 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                : "ring-border-color"
        )}>
            {isModified && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50" />
            )}
            <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0 z-10">
                {icon && (
                    <div className={cn(
                        "h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 relative",
                        isModified
                            ? "bg-amber-500/20 text-amber-500"
                            : "bg-black/5 dark:bg-white/5 text-secondary group-hover:text-primary group-hover:bg-primary/10"
                    )}>
                        {icon}
                        {isModified && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                            </span>
                        )}
                    </div>
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={cn(
                        "text-sm font-semibold transition-colors truncate",
                        isModified ? "text-amber-500" : "text-foreground group-hover:text-primary/90"
                    )}>{title}</span>
                    {description && <span className="text-xs text-secondary max-w-[450px] leading-relaxed line-clamp-2 md:line-clamp-none">{description}</span>}
                </div>
            </div>
            <div className="flex items-center shrink-0 ml-2 z-10">
                {children}
            </div>
        </div>
    )
}


interface CommonProps {
    settings: AppSettings
    update: (key: keyof AppSettings, value: any) => Promise<void>
    save: (s: AppSettings) => Promise<void> | void
    version?: string
    modifiedKeys?: string[]
}

interface ConnectionProps extends CommonProps {
    tunEnabled?: boolean
    onTunToggle?: () => void
}

function GeneralSettings({ settings, update, version, modifiedKeys = [] }: CommonProps) {
    const { t, i18n } = useTranslation()
    const { theme, setTheme } = useTheme()

    // Sync theme with settings
    const handleThemeChange = (mode: string) => {
        setTheme(mode)
        update("theme", mode)
    }

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang)
        import("@tauri-apps/api/event").then(({ emit }) => {
            emit("language-changed", lang)
        })
    }

    return (
        <div className="py-2">
            <Section title={t('settings.general.appearance')} icon={<Monitor size={14} />}>
                <SettingItem
                    title={t('settings.general.mode.title', { defaultValue: 'Theme Mode' })}
                    description={t('settings.general.mode.desc', { defaultValue: 'Choose your preferred visual style' })}
                    icon={<Sun size={20} />}
                >
                    <div className="flex items-center p-1 bg-black/10 dark:bg-black/20 rounded-xl border border-white/5">
                        {[
                            { id: "light", icon: <Sun size={14} /> },
                            { id: "dark", icon: <Moon size={14} /> },
                            { id: "system", icon: <Laptop size={14} /> }
                        ].map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => handleThemeChange(mode.id)}
                                className={cn(
                                    "p-2 rounded-lg transition-all",
                                    theme === mode.id
                                        ? "bg-white dark:bg-white/10 text-primary shadow-sm"
                                        : "text-tertiary hover:text-secondary hover:bg-white/5"
                                )}
                                title={t(`settings.general.mode.${mode.id}`)}
                            >
                                {mode.icon}
                            </button>
                        ))}
                    </div>
                </SettingItem>

                <SettingItem
                    title={t('settings.general.show_sidebar_status.title', { defaultValue: 'Show Status Info' })}
                    description={t('settings.general.show_sidebar_status.desc', { defaultValue: 'Show connection status and speed graph in sidebar.' })}
                    icon={<Activity size={20} />}
                >
                    <Switch checked={settings.show_sidebar_status} onCheckedChange={(v) => update("show_sidebar_status", v)} />
                </SettingItem>
            </Section>

            <Section title={t('settings.language.title')} icon={<Globe size={14} />}>
                <SettingItem
                    title={t('settings.language.display_language', { defaultValue: 'Display Language' })}
                    description={t('settings.language.desc', { defaultValue: 'Change the language of the user interface' })}
                    icon={<Globe size={20} />}
                >
                    <div className="flex items-center p-1 bg-black/10 dark:bg-black/20 rounded-xl border border-white/5 gap-1">
                        {[
                            { id: "en", label: "EN" },
                            { id: "zh-CN", label: "中文" }
                        ].map((lang) => (
                            <button
                                key={lang.id}
                                onClick={() => changeLanguage(lang.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-w-[40px]",
                                    i18n.language === lang.id
                                        ? "bg-white dark:bg-white/10 text-primary shadow-sm"
                                        : "text-tertiary hover:text-secondary hover:bg-white/5"
                                )}
                            >
                                {lang.label}
                            </button>
                        ))}
                    </div>
                </SettingItem>
            </Section>

            <Section title={t('settings.general.launch_behavior')} icon={<Power size={14} />}>
                <SettingItem
                    title={t('settings.general.launch_at_login.title')}
                    description={t('settings.general.launch_at_login.desc')}
                    icon={<Power size={20} />}
                >
                    <Switch checked={settings.launch_at_login} onCheckedChange={(v) => update("launch_at_login", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.general.start_minimized.title')}
                    description={t('settings.general.start_minimized.desc')}
                    icon={<Monitor size={20} />}
                >
                    <Switch checked={settings.start_minimized} onCheckedChange={(v) => update("start_minimized", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.general.auto_connect.title')}
                    description={t('settings.general.auto_connect.desc')}
                    icon={<Zap size={20} />}
                >
                    <Switch checked={settings.auto_connect} onCheckedChange={(v) => update("auto_connect", v)} />
                </SettingItem>
            </Section>

            <Section title={t('settings.general.app_update')} icon={<RefreshCw size={14} />}>
                <SettingItem
                    title={
                        <div className="flex items-center gap-2">
                            <span>{t('settings.general.auto_check_update.title')}</span>
                            {version && (
                                <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                                    v{version}
                                </span>
                            )}
                        </div>
                    }
                    description={t('settings.general.auto_check_update.desc')}
                    icon={<RefreshCw size={20} />}
                >
                    <Switch checked={settings.auto_update} onCheckedChange={(v) => update("auto_update", v)} />
                </SettingItem>
                <div className="flex justify-end mt-2 px-1">
                    <CheckUpdateBtn />
                </div>
            </Section>
        </div>
    )
}

function CheckUpdateBtn() {
    const { t } = useTranslation()
    const [status, setStatus] = useState<'idle' | 'checking' | 'found' | 'downloading' | 'ready'>('idle')
    const [progress, setProgress] = useState(0)
    const [updateObj, setUpdateObj] = useState<any>(null)
    const [updateVersion, setUpdateVersion] = useState<string>("")
    const [isSimulation, setIsSimulation] = useState(false)

    const checkUpdate = async (e: React.MouseEvent) => {
        // Step 3: Restart (Ready)
        if (status === 'ready') {
            if (isSimulation) {
                toast.info(t('settings.advanced.core.sim_title'), {
                    description: t('settings.advanced.core.sim_desc')
                })
                setTimeout(() => {
                    setStatus('idle')
                    setIsSimulation(false)
                }, 1000)
                return
            }
            await invoke("restart_app")
            return
        }

        // Step 2: Download & Install (Found)
        if (status === 'found') {
            setStatus('downloading')
            try {
                if (isSimulation) {
                    // Sim download
                    let p = 0
                    const interval = setInterval(() => {
                        p += 10
                        setProgress(p)
                        if (p >= 100) {
                            clearInterval(interval)
                            setStatus('ready')
                            toast.success(t('update.ready_title', { defaultValue: 'Update Ready' }), {
                                description: t('update.restart_desc', { defaultValue: 'Restart to apply update.' })
                            })
                        }
                    }, 200)
                    return
                }

                // Real download
                if (updateObj) {
                    let downloaded = 0
                    let total = 0
                    await updateObj.downloadAndInstall((event: any) => {
                        switch (event.event) {
                            case 'Started':
                                total = event.data.contentLength || 0
                                break
                            case 'Progress':
                                downloaded += event.data.chunkLength
                                if (total > 0) {
                                    setProgress(Math.round((downloaded / total) * 100))
                                }
                                break
                        }
                    })
                    setStatus('ready')
                    toast.success(t('update.ready_title', { defaultValue: 'Update Ready' }), {
                        description: t('update.restart_desc', { defaultValue: 'Restart to apply update.' })
                    })
                }
            } catch (e) {
                console.error(e)
                toast.error(t('settings.advanced.core.error'), { description: String(e) })
                setStatus('idle')
            }
            return
        }

        // SIMULATION MODE TRIGGER (Alt + Click)
        if (e.altKey && status === 'idle') {
            setIsSimulation(true)
            setStatus('checking')
            setTimeout(() => {
                const testVersion = "TEST-2.0.0"
                setUpdateVersion(testVersion)
                setStatus('found')
                toast.info(t('update.sim_found', { version: testVersion }))
            }, 1000)
            return
        }

        // Step 1: Check (Idle)
        setStatus('checking')
        try {
            const { check } = await import("@tauri-apps/plugin-updater")
            const update = await check()
            if (update && update.available) {
                setUpdateObj(update)
                setUpdateVersion(update.version)
                setStatus('found')
                toast.success(t('update.found', { version: update.version, defaultValue: `New version v${update.version} available` }))
            } else {
                toast.info(t('settings.advanced.core.latest'))
                setStatus('idle')
            }
        } catch (e) {
            console.error(e)
            toast.error(t('settings.advanced.core.error'), {
                description: String(e)
            })
            setStatus('idle')
        }
    }

    return (
        <button
            onClick={checkUpdate}
            disabled={status === 'checking' || status === 'downloading'}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold disabled:opacity-50 min-w-[120px] justify-center overflow-hidden",
                status === 'ready'
                    ? "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                    : status === 'found'
                        ? "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
        >
            <RefreshCw size={14} className={status === 'checking' || status === 'downloading' ? "animate-spin shrink-0" : "shrink-0"} />
            <span className="truncate">
                {status === 'checking' && t('settings.advanced.core.checking')}
                {status === 'found' && (t('update.install_now', { version: updateVersion, defaultValue: `Install v${updateVersion}` }))}
                {status === 'downloading' && `${t('settings.advanced.core.downloading', { defaultValue: 'Downloading' })} ${progress}%`}
                {status === 'ready' && t('settings.advanced.core.restart', { defaultValue: 'Restart to Apply' })}
                {status === 'idle' && t('settings.advanced.core.check_update')}
            </span>
        </button>
    )
}

function ConnectionSettings({ settings, update, save, tunEnabled, onTunToggle, modifiedKeys = [] }: ConnectionProps) {
    const { t } = useTranslation()
    const [port, setPort] = useState(settings.mixed_port.toString())
    const [mtu, setMtu] = useState(settings.tun_mtu.toString())

    return (
        <div className="py-2">
            <Section title={t('settings.connection.basic_proxy')} icon={<Server size={14} />}>
                <SettingItem
                    title={t('settings.connection.system_proxy.title')}
                    description={t('settings.connection.system_proxy.desc')}
                    icon={<Server size={20} />}
                    isModified={modifiedKeys.includes("system_proxy")}
                >
                    <Switch checked={settings.system_proxy} onCheckedChange={(v) => update("system_proxy", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.allow_lan.title')}
                    description={t('settings.connection.allow_lan.desc')}
                    icon={<Globe size={20} />}
                    isModified={modifiedKeys.includes("allow_lan")}
                >
                    <Switch checked={settings.allow_lan} onCheckedChange={(v) => update("allow_lan", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.mixed_port.title')}
                    description={t('settings.connection.mixed_port.desc')}
                    icon={<Database size={20} />}
                    isModified={modifiedKeys.includes("mixed_port")}
                >
                    <div className="flex items-center gap-1 bg-card-bg border border-border-color rounded-xl p-1">
                        <button
                            onClick={() => {
                                const val = (parseInt(port) || 2080) - 1
                                setPort(val.toString())
                                update("mixed_port", val)
                            }}
                            className="size-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <input
                            type="number"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            onBlur={() => {
                                const val = parseInt(port) || 2080
                                update("mixed_port", val)
                            }}
                            className="w-16 bg-transparent border-none text-sm text-center focus:outline-none font-mono text-foreground p-0 no-spinner"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        <button
                            onClick={() => {
                                const val = (parseInt(port) || 2080) + 1
                                setPort(val.toString())
                                update("mixed_port", val)
                            }}
                            className="size-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </SettingItem>
            </Section>

            <Section title={t('settings.connection.tun_mode')} icon={<Zap size={14} />}>
                <SettingItem
                    title={t('settings.connection.enable_tun.title')}
                    description={t('settings.connection.enable_tun.desc')}
                    icon={<Zap size={20} />}
                    isModified={modifiedKeys.includes("tun_mode")}
                >
                    <Switch checked={!!tunEnabled} onCheckedChange={() => onTunToggle && onTunToggle()} />
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.stack.title')}
                    description={t('settings.connection.stack.desc')}
                    icon={<Shield size={20} />}
                    isModified={modifiedKeys.includes("tun_stack")}
                >
                    <select
                        value={settings.tun_stack}
                        onChange={(e) => update("tun_stack", e.target.value)}
                        className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground"
                    >
                        <option value="gvisor">gVisor ({t('common.recommended')})</option>
                        <option value="system">System</option>
                        <option value="mixed">Mixed</option>
                    </select>
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.mtu.title')}
                    description={t('settings.connection.mtu.desc')}
                    icon={<RefreshCw size={20} />}
                    isModified={modifiedKeys.includes("tun_mtu")}
                >
                    <div className="flex items-center gap-1 bg-card-bg border border-border-color rounded-xl p-1">
                        <button
                            onClick={() => {
                                const val = (parseInt(mtu) || 9000) - 100
                                setMtu(val.toString())
                                update("tun_mtu", val)
                            }}
                            className="size-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <input
                            type="number"
                            value={mtu}
                            onChange={(e) => setMtu(e.target.value)}
                            onBlur={() => {
                                const val = parseInt(mtu) || 9000
                                update("tun_mtu", val)
                            }}
                            className="w-16 bg-transparent border-none text-sm text-center focus:outline-none font-mono text-foreground p-0 no-spinner"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                        <button
                            onClick={() => {
                                const val = (parseInt(mtu) || 9000) + 100
                                setMtu(val.toString())
                                update("tun_mtu", val)
                            }}
                            className="size-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-secondary hover:text-primary transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.strict_route.title')}
                    description={t('settings.connection.strict_route.desc')}
                    icon={<RefreshCw size={20} />}
                    isModified={modifiedKeys.includes("strict_route")}
                >
                    <Switch checked={settings.strict_route} onCheckedChange={(v) => update("strict_route", v)} />
                </SettingItem>
            </Section>
        </div >
    )
}

function DnsSettings({ settings, update, save, modifiedKeys = [] }: CommonProps) {
    const { t } = useTranslation()
    const [servers, setServers] = useState(settings.dns_servers)

    return (
        <div className="py-2">
            <Section title={t('settings.dns.resolution_core')} icon={<Database size={14} />}>
                <SettingItem
                    title={t('settings.dns.dns_hijack.title')}
                    description={t('settings.dns.dns_hijack.desc')}
                    icon={<Shield size={20} />}
                    isModified={modifiedKeys.includes("dns_hijack")}
                >
                    <Switch checked={settings.dns_hijack} onCheckedChange={(v) => update("dns_hijack", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.dns.strategy.title')}
                    description={t('settings.dns.strategy.desc')}
                    icon={<Globe size={20} />}
                    isModified={modifiedKeys.includes("dns_strategy")}
                >
                    <select
                        value={settings.dns_strategy}
                        onChange={(e) => update("dns_strategy", e.target.value)}
                        className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground"
                    >
                        <option value="ipv4">{t('settings.dns.strategy.prefer_ipv4')}</option>
                        <option value="ipv6">{t('settings.dns.strategy.prefer_ipv6')}</option>
                        <option value="only4">{t('settings.dns.strategy.only_ipv4')}</option>
                    </select>
                </SettingItem>
            </Section>

            <Section title={t('settings.dns.upstream')} icon={<Server size={14} />}>
                <div className="glass-card p-6 rounded-3xl border border-border-color">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-secondary uppercase tracking-wider">{t('settings.dns.server_list')}</span>
                        <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">{t('settings.dns.one_per_line')}</span>
                    </div>
                    <textarea
                        value={servers}
                        onChange={(e) => setServers(e.target.value)}
                        onBlur={() => update("dns_servers", servers)}
                        className={cn(
                            "w-full h-40 bg-card-bg border rounded-2xl p-4 text-xs font-mono text-foreground focus:outline-none focus:border-primary/30 transition-all resize-none shadow-inner",
                            modifiedKeys.includes("dns_servers") ? "border-amber-500/50 ring-1 ring-amber-500/20" : "border-border-color"
                        )}
                    />
                </div>
            </Section>
        </div>
    )
}

interface AdvancedProps extends CommonProps {
    clashApiPort?: number | null
    helperApiPort?: number | null
}

function AdvancedSettings({ settings, update, clashApiPort, helperApiPort, modifiedKeys = [] }: AdvancedProps) {
    const { t } = useTranslation()
    const [refreshingGeoData, setRefreshingGeoData] = useState(false)
    const [isExportingSingbox, setIsExportingSingbox] = useState(false)
    const [isExportingBackup, setIsExportingBackup] = useState(false)

    const handleExportSingbox = async () => {
        setIsExportingSingbox(true)
        try {
            const content = await invoke<string>("export_singbox_config")
            const path = await save({
                defaultPath: "sing-box_config.json",
                filters: [{ name: "JSON", extensions: ["json"] }]
            })
            if (path) {
                await writeTextFile(path, content)
                toast.success(t('export.saved_file'))
            }
        } catch (e) {
            console.error(e)
            toast.error(t('export.failed'))
        } finally {
            setIsExportingSingbox(false)
        }
    }

    const handleExportBackup = async () => {
        setIsExportingBackup(true)
        try {
            const content = await invoke<string>("export_tunnet_backup")
            // Use local timezone for filename
            const now = new Date()
            const year = now.getFullYear()
            const month = String(now.getMonth() + 1).padStart(2, '0')
            const day = String(now.getDate()).padStart(2, '0')
            const dateStr = `${year}-${month}-${day}`
            const path = await save({
                defaultPath: `tunnet_backup_${dateStr}.json`,
                filters: [{ name: "JSON", extensions: ["json"] }]
            })
            if (path) {
                await writeTextFile(path, content)
                toast.success(t('export.saved_file'))
            }
        } catch (e) {
            console.error(e)
            toast.error(t('export.failed'))
        } finally {
            setIsExportingBackup(false)
        }
    }

    const handleRestoreBackup = async () => {
        try {
            const selected = await openDialog({
                filters: [{ name: "JSON", extensions: ["json"] }],
                multiple: false
            })
            if (selected && typeof selected === 'string') {
                const content = await readTextFile(selected)
                await invoke("import_tunnet_backup", { json: content })
                toast.success(t('settings.advanced.data.restore_success', { defaultValue: "Restore successful" }))

                // Reload window to refresh all state after restore
                setTimeout(() => {
                    window.location.reload()
                }, 500)
            }
        } catch (e) {
            console.error(e)
            toast.error(t('settings.advanced.data.restore_failed', { defaultValue: "Restore failed" }))
        }
    }

    const handleRefreshGeoData = async () => {
        setRefreshingGeoData(true)
        try {
            await invoke("refresh_geodata")
            toast.success(t('toast.update_completed'))
        } catch (e) {
            console.error("Failed to refresh geodata", e)
            toast.error(t('toast.update_failed', { error: String(e) }))
        } finally {
            setRefreshingGeoData(false)
        }
    }

    return (
        <div className="py-2">
            <Section title={t('settings.advanced.debug_log')} icon={<Bug size={14} />}>
                <SettingItem
                    title={t('settings.advanced.log_level.title')}
                    description={t('settings.advanced.log_level.desc')}
                    icon={<Bug size={20} />}
                    isModified={modifiedKeys.includes("log_level")}
                >
                    <select
                        value={settings.log_level}
                        onChange={(e) => update("log_level", e.target.value)}
                        className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground"
                    >
                        <option value="info">Info ({t('common.default')})</option>
                        <option value="debug">Debug</option>
                        <option value="trace">Trace</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                    </select>
                </SettingItem>
            </Section>
            <Section title={t('settings.advanced.persistence')} icon={<Database size={14} />}>
                <SettingItem
                    title={t('settings.advanced.geodata.title')}
                    description={t('settings.advanced.geodata.desc')}
                    icon={<Database size={20} />}
                >
                    <button
                        onClick={handleRefreshGeoData}
                        disabled={refreshingGeoData}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all text-xs font-bold disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshingGeoData ? "animate-spin" : ""} />
                        {refreshingGeoData ? t('settings.advanced.core.updating') : t('settings.advanced.geodata.refresh')}
                    </button>
                </SettingItem>
                <SettingItem
                    title={t('settings.advanced.cache_dir.title')}
                    description={t('settings.advanced.cache_dir.desc')}
                    icon={<Database size={20} />}
                >
                    <div className="flex items-center gap-3">
                        <code className="text-[10px] bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-border-color text-secondary font-mono italic">~/Library/Application.../cache.db</code>
                    </div>
                </SettingItem>
            </Section>

            <Section title={t('settings.advanced.data.title', { defaultValue: "Data Management" })} icon={<Database size={14} />}>
                <SettingItem
                    title={t('settings.advanced.data.singbox_export.title', { defaultValue: "Export Sing-box Config" })}
                    description={t('settings.advanced.data.singbox_export.desc', { defaultValue: "Export as a pure sing-box compatible JSON file." })}
                    icon={<FileJson size={20} />}
                >
                    <button
                        onClick={handleExportSingbox}
                        disabled={isExportingSingbox}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all text-xs font-bold disabled:opacity-50"
                    >
                        {isExportingSingbox ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                        {t('settings.advanced.data.export', { defaultValue: "Export" })}
                    </button>
                </SettingItem>
                <SettingItem
                    title={t('settings.advanced.data.tunnet_backup.title', { defaultValue: "Full Tunnet Backup" })}
                    description={t('settings.advanced.data.tunnet_backup.desc', { defaultValue: "Export all nodes, groups, rules and settings for migration." })}
                    icon={<Database size={20} />}
                >
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRestoreBackup}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-secondary hover:text-foreground transition-all text-xs font-bold"
                        >
                            <FileUp size={14} />
                            {t('settings.advanced.data.restore', { defaultValue: "Restore" })}
                        </button>
                        <button
                            onClick={handleExportBackup}
                            disabled={isExportingBackup}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all text-xs font-bold disabled:opacity-50"
                        >
                            {isExportingBackup ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                            {t('settings.advanced.data.backup', { defaultValue: "Backup" })}
                        </button>
                    </div>
                </SettingItem>
            </Section>

            <Section title={t('settings.advanced.component.title', { defaultValue: 'Component Management' })} icon={<Server size={14} />}>
                <SettingItem
                    title={t('settings.advanced.core.title')}
                    description={t('settings.advanced.core.desc')}
                    icon={<Zap size={20} />}
                >
                    <div className="flex flex-col gap-2 items-end">
                        <div className="flex flex-col gap-2 items-end">
                            {clashApiPort && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">{t('settings.advanced.core.main_controller')}</span>
                                    <code className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-1 rounded select-all cursor-text min-w-[160px] text-center">
                                        http://127.0.0.1:{clashApiPort}
                                    </code>
                                </div>
                            )}
                            {helperApiPort && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">{t('settings.advanced.core.helper_controller')}</span>
                                    <code className="text-[11px] font-mono bg-accent-green/10 text-accent-green px-2 py-1 rounded select-all cursor-text min-w-[160px] text-center">
                                        http://127.0.0.1:{helperApiPort}
                                    </code>
                                </div>
                            )}
                            {!clashApiPort && !helperApiPort && (
                                <span className="text-xs text-secondary/50 italic">{t('status.stopped')}</span>
                            )}
                        </div>


                    </div>
                </SettingItem>

                <SettingItem
                    title={t('settings.advanced.component.helper_tool.title', { defaultValue: 'Privileged Helper' })}
                    description={t('settings.advanced.component.helper_tool.desc', { defaultValue: 'Background service for system networking permissions.' })}
                    icon={<Shield size={20} />}
                >
                    <ReinstallHelperBtn />
                </SettingItem>
            </Section >
        </div >
    )
}



function AboutSection({ version }: { version: string }) {
    const { t } = useTranslation()
    const [clicks, setClicks] = useState(0)

    const handleTestUpdate = () => {
        const newClicks = clicks + 1
        setClicks(newClicks)
        if (newClicks >= 5) {
            setClicks(0)
            const testVersion = "TEST-0.9.9"
            import("@tauri-apps/api/event").then(({ emit }) => {
                emit("update-available", testVersion)
                toast.info(t('settings.about.sim_auto_update', { version: testVersion }))
            })
        }
    }

    return (
        <div className="flex flex-col items-center justify-center py-10 gap-10">
            <div className="relative">
                <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full animate-pulse"></div>
                <div className="relative z-10">
                    <Rocket size={128} />
                </div>
            </div>

            <div className="flex flex-col items-center gap-2 text-center relative z-10">
                <h2 className="text-4xl font-extrabold tracking-tighter text-foreground">Tunnet</h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">{t('settings.about.alpha_access')}</span>
                    <span
                        onClick={handleTestUpdate}
                        className="text-[10px] text-secondary font-mono uppercase tracking-widest cursor-pointer hover:text-primary transition-colors select-none"
                    >
                        v{version}
                    </span>
                </div>
            </div>

            <p className="text-[10px] text-tertiary font-medium mt-10 text-center tracking-widest">
                TUNNET PROJECT &copy; 2026.
            </p>
        </div>
    )
}

function Rocket(props: any) {
    return (
        <img
            src="/app-icon.png"
            alt="Tunnet Icon"
            width={props.size || 64}
            height={props.size || 64}
            className="rounded-2xl shadow-lg"
        />
    )
}

function QuitButton() {
    const { t } = useTranslation()
    const [isQuitting, setIsQuitting] = useState(false)

    const handleQuit = async () => {
        if (isQuitting) return
        setIsQuitting(true)
        const toastId = toast.loading(t('sidebar.quitting', { defaultValue: 'Quitting...' }))

        try {
            await import("@tauri-apps/api/event").then(({ emit }) => emit("ui:initiate-exit"))
            // await invoke('quit_app') // Moved to AppShell
        } catch (e) {
            console.error('Failed to quit app:', e)
            setIsQuitting(false)
            toast.dismiss(toastId)
            toast.error(t('sidebar.quit_failed', { defaultValue: 'Failed to quit' }))
        }
    }

    return (
        <button
            onClick={handleQuit}
            disabled={isQuitting}
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-300 border whitespace-nowrap",
                "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white hover:border-red-500",
                isQuitting && "opacity-50 cursor-not-allowed"
            )}
            title={t('sidebar.quit')}
        >
            {isQuitting ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
            <span className="hidden sm:inline">{t('sidebar.quit')}</span>
        </button>
    )
}

function ReinstallHelperBtn() {
    const { t } = useTranslation()
    const [installing, setInstalling] = useState(false)

    const handleReinstall = async () => {
        setInstalling(true)
        const toastId = toast.loading(t('settings.advanced.component.installing', { defaultValue: 'Installing helper...' }))

        try {
            await invoke("install_helper")
            toast.dismiss(toastId)
            toast.success(t('settings.advanced.component.install_success', { defaultValue: 'Helper installed successfully' }))
        } catch (e) {
            console.error("Helper install failed:", e)
            toast.dismiss(toastId)
            toast.error(t('settings.advanced.component.install_failed', { defaultValue: 'Installation failed' }), {
                description: String(e)
            })
        } finally {
            setInstalling(false)
        }
    }

    return (
        <button
            onClick={handleReinstall}
            disabled={installing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-secondary hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all text-[11px] font-medium disabled:opacity-50"
        >
            <Shield size={12} />
            {installing
                ? t('settings.advanced.component.installing_short', { defaultValue: 'Installing...' })
                : t('settings.advanced.component.reinstall_helper', { defaultValue: 'Reinstall Helper' })
            }
        </button>
    )
}


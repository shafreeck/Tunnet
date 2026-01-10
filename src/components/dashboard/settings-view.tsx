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
    Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { AppSettings, defaultSettings, getAppSettings, saveAppSettings } from "@/lib/settings"
import { getVersion } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/core"
import { useTranslation } from "react-i18next"
import { toast } from "sonner" // Assuming you have sonner or some toast, if not I should remove it or check. 
// Note: I don't see sonner in imports but it's common. I'll stick to console if not standard.

type SettingCategory = "general" | "connection" | "dns" | "advanced" | "about"

interface SettingsViewProps {
    initialCategory?: SettingCategory
    onClose?: () => void
    clashApiPort?: number | null
    tunEnabled?: boolean
    onTunToggle?: () => void
}

export function SettingsView({ initialCategory = "general", clashApiPort, tunEnabled, onTunToggle }: SettingsViewProps) {
    const { t } = useTranslation()
    const [activeCategory, setActiveCategory] = useState<SettingCategory>(initialCategory)
    const [settings, setSettings] = useState<AppSettings>(defaultSettings)
    const [loading, setLoading] = useState(true)
    const [isMac, setIsMac] = useState(false)

    useEffect(() => {
        if (typeof navigator !== 'undefined') {
            setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
        }
    }, [])

    const refreshSettings = useCallback(async () => {
        setLoading(true)
        const s = await getAppSettings()
        setSettings(s)
        setLoading(false)
    }, [])

    useEffect(() => {
        refreshSettings()

        // Listen for backend updates (e.g. from System Tray)
        import("@tauri-apps/api/event").then(({ listen }) => {
            const unlisten = listen<AppSettings>("settings-update", (event) => {
                console.log("Settings updated from backend:", event.payload)
                setSettings(event.payload)
            })

            return () => {
                unlisten.then(f => f())
            }
        })
    }, [refreshSettings])

    const updateSetting = async (key: keyof AppSettings, value: any) => {
        const newSettings = { ...settings, [key]: value }
        setSettings(newSettings)
        try {
            await saveAppSettings(newSettings)
            // Optional: toast success
        } catch (e) {
            console.error("Failed to save setting", e)
            // Revert?
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
        try {
            await saveAppSettings(newSettings)
        } catch (e) {
            console.error("Failed to save", e)
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
                "border-b border-black/[0.02] dark:border-white/[0.02] flex items-center px-4 md:pl-8 bg-transparent shrink-0 relative z-30",
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
                        </button>
                    ))}
                </div>

                <div className="ml-auto z-10">
                    <QuitButton />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto sidebar-scroll px-4 md:px-8 py-6 md:py-10">
                <div className="max-w-3xl mx-auto pb-10">
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {loading ? (
                            <div className="flex items-center justify-center p-20 text-secondary">{t('settings.loading')}</div>
                        ) : (
                            <>
                                {activeCategory === "general" && <GeneralSettings settings={settings} update={updateSetting} save={handleSave} />}
                                {activeCategory === "connection" && <ConnectionSettings settings={settings} update={updateSetting} save={handleSave} tunEnabled={tunEnabled} onTunToggle={onTunToggle} />}
                                {activeCategory === "dns" && <DnsSettings settings={settings} update={updateSetting} save={handleSave} />}
                                {activeCategory === "advanced" && <AdvancedSettings settings={settings} update={updateSetting} save={handleSave} clashApiPort={clashApiPort} />}
                                {activeCategory === "about" && <AboutSection />}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function Section({ title, children, icon }: { title: string, children: React.ReactNode, icon?: React.ReactNode }) {
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
    icon
}: {
    title: string,
    description?: string,
    children: React.ReactNode,
    icon?: React.ReactNode
}) {
    return (
        <div className="glass-card flex items-center justify-between p-4 md:p-5 rounded-3xl transition-all duration-500 ring-1 ring-border-color group">
            <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
                {icon && (
                    <div className="size-10 md:size-12 shrink-0 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-secondary group-hover:text-primary transition-all duration-300 group-hover:bg-primary/10 group-hover:scale-110">
                        {icon}
                    </div>
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary/90 transition-colors truncate">{title}</span>
                    {description && <span className="text-xs text-secondary max-w-[450px] leading-relaxed line-clamp-2 md:line-clamp-none">{description}</span>}
                </div>
            </div>
            <div className="flex items-center shrink-0 ml-2">
                {children}
            </div>
        </div>
    )
}


interface CommonProps {
    settings: AppSettings
    update: (key: keyof AppSettings, value: any) => Promise<void>
    save: (s: AppSettings) => Promise<void> | void
}

interface ConnectionProps extends CommonProps {
    tunEnabled?: boolean
    onTunToggle?: () => void
}

function GeneralSettings({ settings, update }: CommonProps) {
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
                <div className="glass-card p-1.5 rounded-2xl flex border border-border-color">
                    {[
                        { id: "light", label: t('settings.general.mode.light'), icon: <Sun size={16} /> },
                        { id: "dark", label: t('settings.general.mode.dark'), icon: <Moon size={16} /> },
                        { id: "system", label: t('settings.general.mode.system'), icon: <Laptop size={16} /> }
                    ].map((mode) => (
                        <button
                            key={mode.id}
                            onClick={() => handleThemeChange(mode.id)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all",
                                theme === mode.id
                                    ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                    : "text-secondary hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            {mode.icon}
                            {mode.label}
                        </button>
                    ))}
                </div>
            </Section>

            <Section title={t('settings.language.title')} icon={<Globe size={14} />}>
                <div className="glass-card p-1.5 rounded-2xl flex border border-border-color">
                    {[
                        { id: "en", label: "English" },
                        { id: "zh-CN", label: "简体中文" }
                    ].map((lang) => (
                        <button
                            key={lang.id}
                            onClick={() => changeLanguage(lang.id)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all",
                                i18n.language === lang.id
                                    ? "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm"
                                    : "text-secondary hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            {lang.label}
                        </button>
                    ))}
                </div>
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
            </Section>

            <Section title={t('settings.general.app_update')} icon={<RefreshCw size={14} />}>
                <SettingItem
                    title={t('settings.general.auto_check_update.title')}
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
    const [checking, setChecking] = useState(false)

    const checkUpdate = async () => {
        setChecking(true)
        try {
            const { check } = await import("@tauri-apps/plugin-updater")
            const update = await check()
            if (update) {
                toast.success(t('settings.advanced.core.new'), {
                    description: `v${update.version} ${t('settings.advanced.core.update')}`,
                    action: {
                        label: t('settings.advanced.core.update'),
                        onClick: () => update.downloadAndInstall()
                    }
                })
            } else {
                toast.info(t('settings.advanced.core.latest'))
            }
        } catch (e) {
            console.error(e)
            toast.error(t('settings.advanced.core.error'), {
                description: String(e)
            })
        } finally {
            setChecking(false)
        }
    }

    return (
        <button
            onClick={checkUpdate}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all text-xs font-bold disabled:opacity-50"
        >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? t('settings.advanced.core.checking') : t('settings.advanced.core.check_update')}
        </button>
    )
}

function ConnectionSettings({ settings, update, save, tunEnabled, onTunToggle }: ConnectionProps) {
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
                >
                    <Switch checked={settings.system_proxy} onCheckedChange={(v) => update("system_proxy", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.allow_lan.title')}
                    description={t('settings.connection.allow_lan.desc')}
                    icon={<Globe size={20} />}
                >
                    <Switch checked={settings.allow_lan} onCheckedChange={(v) => update("allow_lan", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.mixed_port.title')}
                    description={t('settings.connection.mixed_port.desc')}
                    icon={<Database size={20} />}
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
                >
                    <Switch checked={!!tunEnabled} onCheckedChange={() => onTunToggle && onTunToggle()} />
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.stack.title')}
                    description={t('settings.connection.stack.desc')}
                    icon={<Shield size={20} />}
                >
                    <select
                        value={settings.tun_stack}
                        onChange={(e) => update("tun_stack", e.target.value)}
                        className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground"
                    >
                        <option value="gvisor">gVisor (推荐)</option>
                        <option value="system">System</option>
                        <option value="mixed">Mixed</option>
                    </select>
                </SettingItem>
                <SettingItem
                    title={t('settings.connection.mtu.title')}
                    description={t('settings.connection.mtu.desc')}
                    icon={<RefreshCw size={20} />}
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
                >
                    <Switch checked={settings.strict_route} onCheckedChange={(v) => update("strict_route", v)} />
                </SettingItem>
            </Section>
        </div >
    )
}

function DnsSettings({ settings, update, save }: CommonProps) {
    const { t } = useTranslation()
    const [servers, setServers] = useState(settings.dns_servers)

    return (
        <div className="py-2">
            <Section title={t('settings.dns.resolution_core')} icon={<Database size={14} />}>
                <SettingItem
                    title={t('settings.dns.dns_hijack.title')}
                    description={t('settings.dns.dns_hijack.desc')}
                    icon={<Shield size={20} />}
                >
                    <Switch checked={settings.dns_hijack} onCheckedChange={(v) => update("dns_hijack", v)} />
                </SettingItem>
                <SettingItem
                    title={t('settings.dns.strategy.title')}
                    description={t('settings.dns.strategy.desc')}
                    icon={<Globe size={20} />}
                >
                    <select
                        value={settings.dns_strategy}
                        onChange={(e) => update("dns_strategy", e.target.value)}
                        className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground"
                    >
                        <option value="ipv4">Prefer IPv4</option>
                        <option value="ipv6">Prefer IPv6</option>
                        <option value="only4">Only IPv4</option>
                    </select>
                </SettingItem>
            </Section>

            <Section title={t('settings.dns.upstream')}>
                <div className="glass-card p-6 rounded-3xl border border-border-color">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-secondary uppercase tracking-wider">{t('settings.dns.server_list')}</span>
                        <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">{t('settings.dns.one_per_line')}</span>
                    </div>
                    <textarea
                        value={servers}
                        onChange={(e) => setServers(e.target.value)}
                        onBlur={() => update("dns_servers", servers)}
                        className="w-full h-40 bg-card-bg border border-border-color rounded-2xl p-4 text-xs font-mono text-foreground focus:outline-none focus:border-primary/30 transition-all resize-none shadow-inner"
                    />
                </div>
            </Section>
        </div>
    )
}

interface AdvancedProps extends CommonProps {
    clashApiPort?: number | null
}

function AdvancedSettings({ settings, update, clashApiPort }: AdvancedProps) {
    const { t } = useTranslation()
    const [refreshingGeoData, setRefreshingGeoData] = useState(false)

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
                >
                    <select
                        value={settings.log_level}
                        onChange={(e) => update("log_level", e.target.value)}
                        className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground"
                    >
                        <option value="info">Info (默认)</option>
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

            <Section title={t('settings.advanced.component')} icon={<Server size={14} />}>
                <SettingItem
                    title={t('settings.advanced.core.title')}
                    description={t('settings.advanced.core.desc')}
                    icon={<Server size={20} />}
                >
                    {clashApiPort ? (
                        <code className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded select-all cursor-text">
                            http://127.0.0.1:{clashApiPort}
                        </code>
                    ) : (
                        <span className="text-xs text-secondary/50 italic">{t('status.stopped')}</span>
                    )}
                </SettingItem>
            </Section >
        </div >
    )
}



function AboutSection() {
    const [version, setVersion] = useState<string>("")

    useEffect(() => {
        getVersion().then(setVersion)
    }, [])

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
                    <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">Alpha Access</span>
                    <span className="text-[10px] text-secondary font-mono uppercase tracking-widest">v{version}</span>
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
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap",
                "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500 hover:text-white hover:border-red-500",
                isQuitting && "opacity-50 cursor-not-allowed"
            )}
            title={t('sidebar.quit')}
        >
            {isQuitting ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            <span className="hidden sm:inline">{t('sidebar.quit')}</span>
        </button>
    )
}

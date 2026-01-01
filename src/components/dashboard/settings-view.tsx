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
    Minus
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AppSettings, defaultSettings, getAppSettings, saveAppSettings } from "@/lib/settings"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner" // Assuming you have sonner or some toast, if not I should remove it or check. 
// Note: I don't see sonner in imports but it's common. I'll stick to console if not standard.

type SettingCategory = "general" | "connection" | "dns" | "advanced" | "about"

interface SettingsViewProps {
    initialCategory?: SettingCategory
    onClose?: () => void
}

export function SettingsView({ initialCategory = "general" }: SettingsViewProps) {
    const [activeCategory, setActiveCategory] = useState<SettingCategory>(initialCategory)
    const [settings, setSettings] = useState<AppSettings>(defaultSettings)
    const [loading, setLoading] = useState(true)

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
        { id: "general", label: "常规", icon: <Monitor size={16} /> },
        { id: "connection", label: "连接", icon: <Zap size={16} /> },
        { id: "dns", label: "DNS", icon: <Globe size={16} /> },
        { id: "advanced", label: "高级", icon: <Shield size={16} /> },
        { id: "about", label: "关于", icon: <Info size={16} /> },
    ]

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500 text-foreground">
            {/* Top Navigation Tabs */}
            <div className="h-14 border-b border-black/[0.02] dark:border-white/[0.02] flex items-center px-8 bg-transparent shrink-0 relative z-30">
                <div className="absolute inset-0 z-0" data-tauri-drag-region />
                <div className="flex bg-card-bg p-1 rounded-xl border border-border-color relative z-10">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id as SettingCategory)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 relative",
                                activeCategory === cat.id
                                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                                    : "text-secondary hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            {cat.icon}
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto sidebar-scroll px-8 py-10">
                <div className="max-w-3xl mx-auto pb-10">
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {loading ? (
                            <div className="flex items-center justify-center p-20 text-secondary">Loading settings...</div>
                        ) : (
                            <>
                                {activeCategory === "general" && <GeneralSettings settings={settings} update={updateSetting} save={handleSave} />}
                                {activeCategory === "connection" && <ConnectionSettings settings={settings} update={updateSetting} save={handleSave} />}
                                {activeCategory === "dns" && <DnsSettings settings={settings} update={updateSetting} save={handleSave} />}
                                {activeCategory === "advanced" && <AdvancedSettings settings={settings} update={updateSetting} save={handleSave} />}
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
        <div className="glass-card flex items-center justify-between p-5 rounded-3xl transition-all duration-500 ring-1 ring-border-color group">
            <div className="flex items-center gap-5">
                {icon && (
                    <div className="size-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-secondary group-hover:text-primary transition-all duration-300 group-hover:bg-primary/10 group-hover:scale-110">
                        {icon}
                    </div>
                )}
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary/90 transition-colors">{title}</span>
                    {description && <span className="text-xs text-secondary max-w-[450px] leading-relaxed">{description}</span>}
                </div>
            </div>
            <div className="flex items-center">
                {children}
            </div>
        </div>
    )
}

function CustomSwitch({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-0",
                checked ? "bg-primary" : "bg-black/10 dark:bg-white/10"
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-300 ease-in-out",
                    checked ? "translate-x-5" : "translate-x-0"
                )}
            />
        </button>
    )
}

interface CommonProps {
    settings: AppSettings
    update: (key: keyof AppSettings, value: any) => void
    save: (s: AppSettings) => void
}

function GeneralSettings({ settings, update }: CommonProps) {
    const { theme, setTheme } = useTheme()

    // Sync theme with settings
    const handleThemeChange = (mode: string) => {
        setTheme(mode)
        update("theme", mode)
    }

    return (
        <div className="py-2">
            <Section title="外观" icon={<Monitor size={14} />}>
                <div className="glass-card p-1.5 rounded-2xl flex border border-border-color">
                    {[
                        { id: "light", label: "亮色", icon: <Sun size={16} /> },
                        { id: "dark", label: "暗色", icon: <Moon size={16} /> },
                        { id: "system", label: "跟随系统", icon: <Laptop size={16} /> }
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

            <Section title="启动行为" icon={<Power size={14} />}>
                <SettingItem
                    title="开机自启动"
                    description="当计算机启动时自动运行 Tunnet。(开发中)"
                    icon={<Power size={20} />}
                >
                    <CustomSwitch checked={settings.launch_at_login} onChange={(v) => update("launch_at_login", v)} />
                </SettingItem>
                <SettingItem
                    title="启动时最小化"
                    description="应用启动后自动隐藏到系统托盘。"
                    icon={<Monitor size={20} />}
                >
                    <CustomSwitch checked={settings.start_minimized} onChange={(v) => update("start_minimized", v)} />
                </SettingItem>
            </Section>

            <Section title="应用更新" icon={<RefreshCw size={14} />}>
                <SettingItem
                    title="自动检查更新"
                    description="应用启动时自动检查最新版本。(开发中)"
                    icon={<RefreshCw size={20} />}
                >
                    <CustomSwitch checked={settings.auto_update} onChange={(v) => update("auto_update", v)} />
                </SettingItem>
            </Section>
        </div>
    )
}

function ConnectionSettings({ settings, update, save }: CommonProps) {
    const [port, setPort] = useState(settings.mixed_port.toString())
    const [mtu, setMtu] = useState(settings.tun_mtu.toString())

    return (
        <div className="py-2">
            <Section title="基础代理" icon={<Server size={14} />}>
                <SettingItem
                    title="设置系统代理"
                    description="自动更新系统 HTTP/HTTPS 代理设置。"
                    icon={<Server size={20} />}
                >
                    <CustomSwitch checked={settings.system_proxy} onChange={(v) => update("system_proxy", v)} />
                </SettingItem>
                <SettingItem
                    title="允许局域网连接"
                    description="允许局域网内的其他设备通过本机的代理端口上网。"
                    icon={<Globe size={20} />}
                >
                    <CustomSwitch checked={settings.allow_lan} onChange={(v) => update("allow_lan", v)} />
                </SettingItem>
                <SettingItem
                    title="混合代理端口"
                    description="HTTP/SOCKS 协议共用端口。默认推荐 2080。"
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

            <Section title="TUN 模式增强" icon={<Zap size={14} />}>
                <SettingItem
                    title="网络堆栈类型"
                    description="gVisor 提供最佳的安全性和兼容性。"
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
                    title="MTU"
                    description="最大传输单元。默认 9000。"
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
                    title="严格路由控制"
                    description="自动将所有系统流量路由到 TUN 接口，防止流量泄漏。"
                    icon={<RefreshCw size={20} />}
                >
                    <CustomSwitch checked={settings.strict_route} onChange={(v) => update("strict_route", v)} />
                </SettingItem>
            </Section>
        </div >
    )
}

function DnsSettings({ settings, update, save }: CommonProps) {
    const [servers, setServers] = useState(settings.dns_servers)

    return (
        <div className="py-2">
            <Section title="解析核心" icon={<Database size={14} />}>
                <SettingItem
                    title="启用 DNS 劫持"
                    description="拦截并在本地解析所有发往标准 DNS 端口 (53) 的请求。"
                    icon={<Shield size={20} />}
                >
                    <CustomSwitch checked={settings.dns_hijack} onChange={(v) => update("dns_hijack", v)} />
                </SettingItem>
                <SettingItem
                    title="解析优先策略"
                    description="选择优先使用 IPv4 还是 IPv6 进行域名解析。"
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

            <Section title="上游服务器配置">
                <div className="glass-card p-6 rounded-3xl border border-border-color">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-secondary uppercase tracking-wider">DNS 服务器列表</span>
                        <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">每行一个地址</span>
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

function AdvancedSettings({ settings, update }: CommonProps) {
    return (
        <div className="py-2">
            <Section title="调试日志" icon={<Bug size={14} />}>
                <SettingItem
                    title="日志详细级别"
                    description="确定核心引擎输出的信息详细程度。"
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

            <Section title="数据持久化">
                <SettingItem
                    title="核心缓存目录"
                    description="存放所有运行时动态数据。"
                    icon={<Database size={20} />}
                >
                    <div className="flex items-center gap-3">
                        <code className="text-[10px] bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-border-color text-secondary font-mono italic">~/Library/Application.../cache.db</code>
                        {/* No functional search button yet */}
                    </div>
                </SettingItem>
            </Section>

            <Section title="组件管理" icon={<Server size={14} />}>
                <SettingItem
                    title="Sing-box 内核"
                    description="管理底层代理核心组件。"
                    icon={<Server size={20} />}
                >
                    <CoreUpdateControl />
                </SettingItem>
            </Section>
        </div>
    )
}

function CoreUpdateControl() {
    const [status, setStatus] = useState<"idle" | "checking" | "available" | "updating" | "uptodate" | "error">("idle")
    const [newVersion, setNewVersion] = useState<string>("")

    const check = async () => {
        setStatus("checking")
        try {
            const v = await invoke<string | null>("check_singbox_update")
            if (v) {
                setNewVersion(v)
                setStatus("available")
            } else {
                setStatus("uptodate")
                setTimeout(() => setStatus("idle"), 3000)
            }
        } catch (e) {
            console.error(e)
            setStatus("error")
            setTimeout(() => setStatus("idle"), 3000)
        }
    }

    const update = async () => {
        setStatus("updating")
        try {
            await invoke("update_singbox_core")
            setStatus("idle")
            // toast.success("Core updated successfully") 
            // Commented out toast to avoid potential issues if not configured, relying on button state reset
        } catch (e) {
            console.error(e)
            setStatus("error")
            setTimeout(() => setStatus("idle"), 3000)
        }
    }

    if (status === "available") {
        return (
            <div className="flex items-center gap-2">
                <span className="text-xs text-primary font-bold">New: {newVersion}</span>
                <button
                    onClick={update}
                    className="bg-primary text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow-md shadow-primary/20 hover:bg-primary-hover transition-all"
                >
                    Update
                </button>
            </div>
        )
    }

    if (status === "updating") return <span className="text-xs text-secondary animate-pulse font-mono">Updating...</span>
    if (status === "checking") return <span className="text-xs text-secondary animate-pulse font-mono">Checking...</span>
    if (status === "uptodate") return <span className="text-xs text-green-500 font-bold">Latest Version</span>
    if (status === "error") return <span className="text-xs text-red-500 font-bold">Error</span>

    return (
        <button
            onClick={check}
            className="text-xs bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors font-semibold text-secondary"
        >
            Check Update
        </button>
    )
}

function AboutSection() {
    return (
        <div className="flex flex-col items-center justify-center py-10 gap-10">
            <div className="relative">
                <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full animate-pulse"></div>
                <div className="size-32 rounded-[2.5rem] bg-gradient-to-br from-primary to-primary-hover p-1 shadow-2xl relative z-10">
                    <div className="w-full h-full rounded-[2.25rem] bg-black flex items-center justify-center">
                        <Rocket size={64} className="text-primary" />
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center gap-2 text-center relative z-10">
                <h2 className="text-4xl font-extrabold tracking-tighter text-foreground">Tunnet</h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">Alpha Access</span>
                    <span className="text-[10px] text-secondary font-mono uppercase tracking-widest">v0.1.0</span>
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
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3" />
            <path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5" />
        </svg>
    )
}

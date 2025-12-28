"use client"

import React, { useState } from "react"
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
    Laptop
} from "lucide-react"
import { cn } from "@/lib/utils"

type SettingCategory = "general" | "connection" | "dns" | "advanced" | "about"

interface SettingsViewProps {
    initialCategory?: SettingCategory
    onClose?: () => void
}

export function SettingsView({ initialCategory = "general" }: SettingsViewProps) {
    const [activeCategory, setActiveCategory] = useState<SettingCategory>(initialCategory)

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
            <div className="h-14 border-b border-black/[0.02] dark:border-white/[0.02] flex items-center px-8 bg-transparent shrink-0">
                <div className="flex bg-card-bg p-1 rounded-xl border border-border-color">
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
                        {activeCategory === "general" && <GeneralSettings />}
                        {activeCategory === "connection" && <ConnectionSettings />}
                        {activeCategory === "dns" && <DnsSettings />}
                        {activeCategory === "advanced" && <AdvancedSettings />}
                        {activeCategory === "about" && <AboutSection />}
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

function GeneralSettings() {
    const { theme, setTheme } = useTheme()
    const [launchAtLogin, setLaunchAtLogin] = useState(false)
    const [startMinimized, setStartMinimized] = useState(true)
    const [autoUpdate, setAutoUpdate] = useState(true)

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
                            onClick={() => setTheme(mode.id)}
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
                    description="当计算机启动时自动运行 Tunnet，确保网络连接始终受到保护。"
                    icon={<Power size={20} />}
                >
                    <CustomSwitch checked={launchAtLogin} onChange={setLaunchAtLogin} />
                </SettingItem>
                <SettingItem
                    title="启动时最小化"
                    description="应用启动后自动隐藏到系统托盘，减少视觉干扰。"
                    icon={<Monitor size={20} />}
                >
                    <CustomSwitch checked={startMinimized} onChange={setStartMinimized} />
                </SettingItem>
            </Section>

            <Section title="应用更新" icon={<RefreshCw size={14} />}>
                <SettingItem
                    title="自动检查更新"
                    description="应用启动时自动检查最新版本，确保您拥有最新的功能和安全修复。"
                    icon={<RefreshCw size={20} />}
                >
                    <CustomSwitch checked={autoUpdate} onChange={setAutoUpdate} />
                </SettingItem>
                <SettingItem
                    title="预发布版本"
                    description="接受 Beta 测试版本 (包含最新功能但也可能有更多 Bug)。"
                    icon={<Zap size={20} />}
                >
                    <CustomSwitch checked={false} onChange={() => { }} />
                </SettingItem>
            </Section>
        </div>
    )
}

function ConnectionSettings() {
    const [systemProxy, setSystemProxy] = useState(true)
    const [allowLan, setAllowLan] = useState(false)

    return (
        <div className="py-2">
            <Section title="基础代理" icon={<Server size={14} />}>
                <SettingItem
                    title="设置系统代理"
                    description="自动更新系统 HTTP/HTTPS 代理设置，使不支持第三方代理设置的应用也能联网。"
                    icon={<Server size={20} />}
                >
                    <CustomSwitch checked={systemProxy} onChange={setSystemProxy} />
                </SettingItem>
                <SettingItem
                    title="允许局域网连接"
                    description="允许局域网内的其他设备通过本机的代理端口上网。"
                    icon={<Globe size={20} />}
                >
                    <CustomSwitch checked={allowLan} onChange={setAllowLan} />
                </SettingItem>
                <SettingItem
                    title="混合代理端口"
                    description="HTTP/SOCKS 协议共用端口。默认推荐 2080。"
                    icon={<Database size={20} />}
                >
                    <input
                        type="number"
                        defaultValue={2080}
                        className="w-24 bg-card-bg border border-border-color rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-primary/50 transition-all font-mono text-foreground"
                    />
                </SettingItem>
            </Section>

            <Section title="TUN 模式增强" icon={<Zap size={14} />}>
                <SettingItem
                    title="网络堆栈类型"
                    description="确定虚拟网络接口的处理方式。gVisor 提供最佳的安全性和兼容性。"
                    icon={<Shield size={20} />}
                >
                    <select className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground">
                        <option value="gvisor">gVisor (推荐)</option>
                        <option value="system">System</option>
                        <option value="mixed">Mixed</option>
                    </select>
                </SettingItem>
                <SettingItem
                    title="严格路由控制"
                    description="自动将所有系统流量路由到 TUN 接口，防止流量泄漏。"
                    icon={<RefreshCw size={20} />}
                >
                    <CustomSwitch checked={true} onChange={() => { }} />
                </SettingItem>
            </Section>
        </div>
    )
}

function DnsSettings() {
    return (
        <div className="py-2">
            <Section title="解析核心" icon={<Database size={14} />}>
                <SettingItem
                    title="启用 DNS 劫持"
                    description="拦截并在本地解析所有发往标准 DNS 端口 (53) 的请求。"
                    icon={<Shield size={20} />}
                >
                    <CustomSwitch checked={true} onChange={() => { }} />
                </SettingItem>
                <SettingItem
                    title="解析优先策略"
                    description="选择优先使用 IPv4 还是 IPv6 进行域名解析。"
                    icon={<Globe size={20} />}
                >
                    <select className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground">
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
                        className="w-full h-40 bg-card-bg border border-border-color rounded-2xl p-4 text-xs font-mono text-foreground focus:outline-none focus:border-primary/30 transition-all resize-none shadow-inner"
                        defaultValue={"8.8.8.8\n114.114.114.114\nhttps://dns.google/dns-query"}
                    />
                </div>
            </Section>
        </div>
    )
}

function AdvancedSettings() {
    return (
        <div className="py-2">
            <Section title="调试日志" icon={<Bug size={14} />}>
                <SettingItem
                    title="日志详细级别"
                    description="确定核心引擎输出的信息详细程度，仅在出现连接问题时建议调高。"
                    icon={<Bug size={20} />}
                >
                    <select className="bg-card-bg border border-border-color rounded-xl px-4 py-2 text-xs font-semibold focus:outline-none focus:border-primary/50 transition-all cursor-pointer text-foreground">
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
                    description="存放所有运行时动态数据。手动清理缓存有助于解决部分持久性连接问题。"
                    icon={<Database size={20} />}
                >
                    <div className="flex items-center gap-3">
                        <code className="text-[10px] bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-border-color text-secondary font-mono italic">~/Library/Application.../cache.db</code>
                        <button className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-secondary hover:text-primary transition-all hover:scale-110 active:scale-90">
                            <Search size={16} />
                        </button>
                    </div>
                </SettingItem>
            </Section>

            <Section title="重置选项" icon={<RefreshCw size={14} />}>
                <div className="glass-card p-6 rounded-3xl border-destructive/20 hover:bg-destructive/5 transition-all duration-500 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-destructive/10 transition-all"></div>
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-foreground uppercase tracking-wide">恢复出厂设置</span>
                            <span className="text-xs text-secondary max-w-[400px]">将应用恢复到初始状态，删除所有自定义规则、订阅和节点。此操作不可撤销。</span>
                        </div>
                        <button className="px-6 py-2.5 rounded-2xl bg-destructive/10 hover:bg-destructive/100 hover:text-white text-destructive text-xs font-bold transition-all border border-destructive/20 active:scale-95 shadow-xl">
                            立即重置
                        </button>
                    </div>
                </div>
            </Section>
        </div>
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
                    <span className="text-[10px] text-secondary font-mono uppercase tracking-widest">v0.1.0 (2025.12.28)</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-5 w-full max-w-md mt-4 relative z-10">
                <a href="#" className="glass-card p-5 rounded-3xl flex flex-col items-center gap-3 hover:bg-black/5 dark:hover:bg-white/10 group active:scale-95">
                    <div className="size-10 rounded-2xl bg-card-bg flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300">
                        <Globe size={20} className="text-secondary group-hover:text-primary" />
                    </div>
                    <span className="text-[11px] font-bold text-secondary group-hover:text-primary uppercase tracking-widest transition-colors">项目官网</span>
                </a>
                <a href="#" className="glass-card p-5 rounded-3xl flex flex-col items-center gap-3 hover:bg-black/5 dark:hover:bg-white/10 group active:scale-95">
                    <div className="size-10 rounded-2xl bg-card-bg flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-300">
                        <Shield size={20} className="text-secondary group-hover:text-primary" />
                    </div>
                    <span className="text-[11px] font-bold text-secondary group-hover:text-primary uppercase tracking-widest transition-colors">隐私保护</span>
                </a>
            </div>

            <p className="text-[10px] text-tertiary font-medium mt-10 text-center tracking-widest">
                TUNNET PROJECT &copy; 2025. CRAFTED FOR PRIVACY & FREEDOM.
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

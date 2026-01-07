"use client"

import React from "react"
import { RefreshCw, Power, Wifi, Bolt, CheckCircle2, XCircle, Globe, Info, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Tooltip } from "react-tooltip"
import 'react-tooltip/dist/react-tooltip.css'
import { getLatencyColor, formatLatency } from "@/lib/latency"
import { getFlagUrlFromCode } from "@/lib/flags"

interface ConnectionStatusProps {
    isConnected: boolean;
    serverName?: string;
    flagUrl?: string;
    // realIp?: string; // Removed in favor of connectionDetails tooltip
    latency?: number;
    onLatencyClick?: () => void;
    onMainToggle?: () => void;
    connectionDetails?: { ip: string; country: string; countryCode?: string; isp?: string };
    mode: 'global' | 'rule' | 'direct';
    onModeChange: (mode: 'global' | 'rule' | 'direct') => void;
    tunEnabled: boolean;
    onTunToggle: () => void;
    systemProxyEnabled: boolean;
    onSystemProxyToggle: () => void;
    isLoading?: boolean;
    targetType?: 'node' | 'group';
    groupIcon?: string;
    targetId?: string | null;
    activeNodeName?: string;
    isLatencyLoading?: boolean;
    connectionState?: "idle" | "connecting" | "disconnecting";
    hasNoServers?: boolean;
}

export function ConnectionStatus({ isConnected, serverName, flagUrl, latency, onLatencyClick, onMainToggle, connectionDetails, mode, onModeChange, tunEnabled, onTunToggle, systemProxyEnabled, onSystemProxyToggle, isLoading, targetType, groupIcon, targetId, activeNodeName, isLatencyLoading, connectionState, hasNoServers }: ConnectionStatusProps) {
    const { t } = useTranslation()
    const realFlagUrl = connectionDetails?.countryCode ? getFlagUrlFromCode(connectionDetails.countryCode) : null
    const displayFlag = (isConnected && realFlagUrl) ? realFlagUrl : flagUrl

    const displayName = hasNoServers ? t('status.no_servers') : (isConnected ? (serverName || t('status.unknown_server')) : t('status.disconnected'))
    const displaySubName = isConnected && targetType === 'group' && activeNodeName && activeNodeName !== serverName ? activeNodeName : null

    // Helper for status colors
    const getStatusColor = () => {
        if (isLoading) {
            if (connectionState === "disconnecting") return 'bg-red-500'
            if (connectionState === "connecting") return 'bg-yellow-500'
            return 'bg-yellow-500'
        }
        if (hasNoServers) return 'bg-primary animate-pulse'
        return isConnected ? 'bg-accent-green' : 'bg-red-500'
    }

    const getStatusText = () => {
        if (isLoading) {
            if (connectionState === "disconnecting") return t('status.disconnecting')
            if (connectionState === "connecting") return t('status.connecting')
            return t('status.switching', { defaultValue: 'SWITCHING' })
        }
        if (hasNoServers) return t('status.setup_needed')
        return isConnected ? t('status.active') : t('status.stopped')
    }

    const [imgError, setImgError] = React.useState(false)

    // Reset error state when desired flag URL changes
    React.useEffect(() => {
        setImgError(false)
    }, [displayFlag])

    const finalFlag = imgError ? flagUrl : displayFlag

    return (
        <div className="flex flex-col items-center justify-center py-6 md:py-10 relative">
            <div className="relative mb-6 group cursor-pointer" onClick={isLoading ? undefined : onMainToggle}>
                <span className={`animate-ping absolute inset-0 inline-flex h-full w-full rounded-full ${hasNoServers ? 'bg-primary' : (isConnected ? 'bg-accent-green' : 'bg-red-500')} opacity-20 duration-1000 ${isLoading ? 'hidden' : ''}`}></span>
                <div className={`relative size-28 rounded-full border border-white/10 bg-black/40 backdrop-blur-xl glow-effect flex items-center justify-center overflow-hidden shadow-2xl transition-transform duration-300 ${isLoading ? 'scale-100 cursor-not-allowed' : 'group-hover:scale-105'}`}>
                    {hasNoServers ? (
                        <div className="flex flex-col items-center justify-center">
                            <Plus className="size-10 text-primary animate-in zoom-in duration-300" />
                        </div>
                    ) : (
                        <>
                            {finalFlag && !imgError ? (
                                <img
                                    className={`w-full h-full object-cover transition-all duration-700 ${isConnected ? 'opacity-60 scale-110' : 'opacity-20 grayscale scale-100'}`}
                                    alt="Country Flag"
                                    src={finalFlag}
                                    onError={() => setImgError(true)}
                                />
                            ) : (
                                <Globe className={`w-1/2 h-1/2 transition-colors duration-500 ${isConnected ? 'text-accent-green opacity-60' : 'text-gray-500 opacity-20'}`} />
                            )}
                            {isLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                                    <RefreshCw className="w-10 h-10 text-white animate-spin drop-shadow-lg" />
                                </div>
                            )}
                        </>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    {!isLoading && (hasNoServers ? (
                        null
                    ) : isConnected ? (
                        <CheckCircle2 className="absolute text-white drop-shadow-lg size-9 fill-white/10" />
                    ) : (
                        <XCircle className="absolute text-white/50 drop-shadow-lg size-9 fill-white/5" />
                    ))}
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-card-bg backdrop-blur-md border border-border-color pl-1 pr-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
                    <span className={`size-2 rounded-full ${getStatusColor()} ${isLoading ? 'animate-bounce' : 'animate-pulse'}`}></span>
                    <span className={`${isLoading ? (connectionState === "disconnecting" ? 'text-red-500' : 'text-yellow-500') : (isConnected ? 'text-accent-green' : 'text-red-500')} text-[10px] font-bold tracking-wider uppercase whitespace-nowrap`}>
                        {getStatusText()}
                    </span>
                </div>
            </div>

            <div className="flex flex-col items-center mb-2">
                <h1
                    className="text-2xl md:text-3xl font-bold text-text-primary mb-1 tracking-tight text-center drop-shadow-md cursor-default outline-none"
                    data-tooltip-id="node-info-tooltip"
                >
                    {displayName}
                </h1>
                {displaySubName && (
                    <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/5 border border-white/10">
                        <span className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">{t('status.connected')}</span>
                        <span className="text-xs font-medium text-text-secondary">{displaySubName}</span>
                    </div>
                )}
            </div>

            <Tooltip
                id="node-info-tooltip"
                className="z-50 !bg-black/90 !text-white !px-4 !py-3 !rounded-xl !shadow-xl !opacity-100 backdrop-blur-md border border-white/10"
                place="bottom"
                variant="dark"
                border="1px solid rgba(255,255,255,0.1)"
            >
                {isConnected && connectionDetails ? (
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                        <div className="flex justify-between items-center pb-2 border-b border-white/10 mb-1">
                            <span className="text-white/60 text-xs font-medium uppercase tracking-wider">{t('dashboard.node_info')}</span>
                            <Info className="size-3.5 text-accent-green/80" />
                        </div>
                        <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 text-sm">
                            <span className="text-white/50">{t('dashboard.ip')}</span>
                            <span className="font-mono text-white/90">{connectionDetails.ip}</span>

                            <span className="text-white/50">{t('dashboard.location')}</span>
                            <span className="text-white/90">{connectionDetails.country}</span>

                            {connectionDetails.isp && (
                                <>
                                    <span className="text-white/50">{t('dashboard.isp')}</span>
                                    <span className="text-white/90 truncate max-w-[180px]">{connectionDetails.isp}</span>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <span className="text-sm text-white/70 px-2">{isConnected ? t('status.checking_ip') : t('status.disconnected_tooltip')}</span>
                )}
            </Tooltip>

            <div className="flex items-center gap-3 text-text-secondary text-xs font-medium mb-8 bg-card-bg backdrop-blur-md px-4 py-1.5 rounded-full border border-border-color shadow-sm">
                <span className="flex items-center gap-1.5 text-text-primary">
                    <Wifi className={`size-3.5 ${isConnected ? 'text-accent-green' : 'text-text-tertiary'}`} />
                    {isConnected ? t('status.connected') : t('status.offline')}
                </span>
                <span className="w-px h-3 bg-border-color"></span>
                <span
                    onClick={isConnected && !isLatencyLoading ? onLatencyClick : undefined}
                    className={`flex items-center gap-1.5 ${isConnected ? `cursor-pointer transition-colors active:scale-95 ${getLatencyColor(latency)}` : 'text-text-secondary'} ${isLatencyLoading ? 'opacity-70 cursor-wait' : ''}`}
                    title={isConnected ? t('dashboard.node_info') : undefined} // Or a specific ping tooltip
                >
                    <div className={isLatencyLoading ? 'animate-spin' : ''}>
                        <Bolt className={`size-3.5 ${isConnected ? 'text-text-primary' : ''}`} />
                    </div>
                    <span className="font-mono pt-[1.5px] leading-none">
                        {isConnected ? formatLatency(latency) : '--'}
                    </span>
                </span>
                <span className="w-px h-3 bg-border-color"></span>

                <button
                    onClick={onSystemProxyToggle}
                    className={`flex items-center gap-1.5 transition-colors hover:text-text-primary ${systemProxyEnabled ? 'text-text-primary' : 'text-text-secondary'} cursor-pointer`}
                    title="Toggle System Proxy"
                >
                    <div className={`size-2 rounded-full ${systemProxyEnabled ? (isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-primary/50') : 'bg-gray-500/30'} transition-all duration-300`} />
                    <span className="text-[11px] md:text-xs font-semibold tracking-wide">
                        {t('status.system_proxy_switch')}
                    </span>
                </button>
                <span className="w-px h-3 bg-border-color"></span>
                <button
                    onClick={onTunToggle}
                    className={`flex items-center gap-1.5 transition-colors hover:text-text-primary ${tunEnabled ? 'text-text-primary' : 'text-text-secondary'} cursor-pointer`}
                    title="Toggle TUN Mode"
                >
                    <div className={`size-2 rounded-full ${tunEnabled ? (isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-primary/50') : 'bg-gray-500/30'} transition-all duration-300`} />
                    <span className="text-[11px] md:text-xs font-semibold tracking-wide">
                        {t('status.tun_mode_switch')}
                    </span>
                </button>
            </div>

            <div className="flex bg-card-bg p-1 rounded-lg border border-border-color backdrop-blur-md mb-8">
                <button
                    onClick={() => onModeChange('global')}
                    className={`px-6 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'global' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                    {t('status.mode.global')}
                </button>
                <button
                    onClick={() => onModeChange('rule')}
                    className={`px-6 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'rule' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                    {t('status.mode.rule')}
                </button>
                <button
                    onClick={() => onModeChange('direct')}
                    className={`px-6 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'direct' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                    {t('status.mode.direct')}
                </button>
            </div>
        </div >
    )
}

interface HeaderProps {
    isConnected: boolean;
    onToggle: () => void;
    isLoading?: boolean;
}

export function Header({ isConnected, onToggle, isLoading }: HeaderProps) {
    const { t } = useTranslation()
    return (
        <header className="flex items-center justify-between px-8 py-5 z-30">
            <div data-tauri-drag-region className="flex-1 h-full cursor-default"></div>
            <div className="flex items-center gap-4">

                <button
                    onClick={onToggle}
                    disabled={isLoading}
                    className={`bg-primary text-white hover:brightness-110 active:scale-95 border border-transparent px-5 py-1.5 rounded-lg shadow-lg flex items-center gap-2 transition-all group ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Power className={`size-4 ${isConnected ? 'text-red-200' : 'text-emerald-200'} group-hover:scale-110 transition-transform`} />
                    <span className="font-semibold text-xs tracking-wide">
                        {isLoading ? t('status.wait') : (isConnected ? t('status.disconnect') : t('status.connect'))}
                    </span>
                </button>
            </div>
        </header>
    )
}

"use client"

import React from "react"
import { RefreshCw, Power, Wifi, Bolt, CheckCircle2, XCircle, Globe } from "lucide-react"

interface ConnectionStatusProps {
    isConnected: boolean;
    serverName?: string;
    flagUrl?: string;
    realIp?: string;
    mode: 'global' | 'rule' | 'direct';
    onModeChange: (mode: 'global' | 'rule' | 'direct') => void;
    tunEnabled: boolean;
    onTunToggle: () => void;
}

export function ConnectionStatus({ isConnected, serverName, flagUrl, realIp, mode, onModeChange, tunEnabled, onTunToggle }: ConnectionStatusProps) {
    const displayFlag = flagUrl // If empty string, it's falsey
    const displayName = isConnected ? (serverName || "Unknown Server") : "Disconnected"

    return (
        <div className="flex flex-col items-center justify-center py-10 relative">
            <div className="relative mb-6 group cursor-pointer">
                <span className={`animate-ping absolute inset-0 inline-flex h-full w-full rounded-full ${isConnected ? 'bg-accent-green' : 'bg-red-500'} opacity-20 duration-1000`}></span>
                <div className={`relative size-28 rounded-full border border-white/10 bg-black/40 backdrop-blur-xl glow-effect flex items-center justify-center overflow-hidden shadow-2xl transition-transform duration-300 group-hover:scale-105`}>
                    {displayFlag ? (
                        <img
                            className={`w-full h-full object-cover ${isConnected ? 'opacity-60' : 'opacity-20 grayscale'}`}
                            alt="Country Flag"
                            src={displayFlag}
                        />
                    ) : (
                        <Globe className={`w-1/2 h-1/2 ${isConnected ? 'text-accent-green opacity-60' : 'text-gray-500 opacity-20'}`} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    {isConnected ? (
                        <CheckCircle2 className="absolute text-white drop-shadow-lg size-9 fill-white/10" />
                    ) : (
                        <XCircle className="absolute text-white/50 drop-shadow-lg size-9 fill-white/5" />
                    )}
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-surface-dark/90 backdrop-blur-md border border-white/10 pl-1 pr-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
                    <span className={`size-2 rounded-full ${isConnected ? 'bg-accent-green' : 'bg-red-500'} animate-pulse`}></span>
                    <span className={`${isConnected ? 'text-accent-green' : 'text-red-500'} text-[10px] font-bold tracking-wider uppercase`}>
                        {isConnected ? 'Active' : 'Stopped'}
                    </span>
                </div>
            </div >

            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight text-center drop-shadow-md">
                {displayName}
            </h1>

            <div className="flex items-center gap-3 text-text-secondary text-xs font-medium mb-8 bg-black/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/5 shadow-inner">
                <span className="flex items-center gap-1.5 text-white/90">
                    <Wifi className={`size-3.5 ${isConnected ? 'text-accent-green' : 'text-gray-500'}`} />
                    {isConnected ? 'Connected' : 'Offline'}
                </span>
                <span className="w-px h-3 bg-white/10"></span>
                <span className="flex items-center gap-1.5 font-mono text-white/80">
                    <Bolt className="size-3.5" />
                    {isConnected ? (realIp || 'Checking IP...') : '--'}
                </span>
                <span className="w-px h-3 bg-white/10"></span>
                <button
                    onClick={onTunToggle}
                    className="flex items-center gap-1.5 transition-colors hover:text-white text-gray-500"
                    title="Toggle TUN Mode (Requires Helper)"
                >
                    {tunEnabled && (
                        <div className={`size-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-in fade-in zoom-in duration-300' : 'bg-gray-500 animate-in fade-in zoom-in duration-300'}`} />
                    )}
                    <span className="text-xs font-semibold tracking-wide">
                        Tun {tunEnabled ? 'On' : 'Off'}
                    </span>
                </button>
            </div>

            <div className="flex bg-black/30 p-1 rounded-lg border border-white/5 backdrop-blur-md mb-8">
                <button
                    onClick={() => onModeChange('global')}
                    className={`px-6 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'global' ? 'bg-white/10 text-white shadow-sm' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
                >
                    Global
                </button>
                <button
                    onClick={() => onModeChange('rule')}
                    className={`px-6 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'rule' ? 'bg-white/10 text-white shadow-sm' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
                >
                    Rule
                </button>
                <button
                    onClick={() => onModeChange('direct')}
                    className={`px-6 py-1.5 rounded-md text-xs font-medium transition-all ${mode === 'direct' ? 'bg-white/10 text-white shadow-sm' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
                >
                    Direct
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
    return (
        <header className="flex items-center justify-between px-8 py-5 z-30">
            <div data-tauri-drag-region className="flex-1 h-full cursor-default"></div>
            <div className="flex items-center gap-4">
                <button className="apple-button flex items-center gap-2 text-white px-4 py-1.5 rounded-lg shadow-sm hover:bg-white/10 active:bg-white/20">
                    <RefreshCw className="size-4" />
                    <span className="text-xs font-medium">Update</span>
                </button>
                <button
                    onClick={onToggle}
                    disabled={isLoading}
                    className={`bg-white text-black hover:bg-gray-100 active:bg-gray-200 border border-transparent px-5 py-1.5 rounded-lg shadow-lg shadow-black/20 flex items-center gap-2 transition-all group ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Power className={`size-4 ${isConnected ? 'text-accent-red' : 'text-green-600'} group-hover:scale-110 transition-transform`} />
                    <span className="font-semibold text-xs tracking-wide">
                        {isLoading ? "WAIT..." : (isConnected ? "DISCONNECT" : "CONNECT")}
                    </span>
                </button>
            </div>
        </header>
    )
}

"use client"

import React from "react"
import { Rocket, Globe, Sliders, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export type MainTabType = "dashboard" | "proxies" | "rules" | "settings"

interface BottomNavProps {
    activeTab: MainTabType
    onTabChange: (tab: MainTabType) => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
    const { t } = useTranslation()

    const tabs = [
        { id: "dashboard" as const, icon: <Rocket size={20} />, label: t('sidebar.dashboard') },
        { id: "proxies" as const, icon: <Globe size={20} />, label: t('sidebar.locations') }, // Using locations label for now or Proxies if available
        { id: "rules" as const, icon: <Sliders size={20} />, label: t('sidebar.rules') },
        { id: "settings" as const, icon: <Settings size={20} />, label: t('sidebar.settings') },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/80 backdrop-blur-xl border-t border-white/10 px-2 pb-safe-area-inset-bottom">
            <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 w-full h-full transition-all duration-200",
                            activeTab === tab.id
                                ? "text-primary scale-110"
                                : "text-tertiary hover:text-secondary"
                        )}
                    >
                        <div className={cn(
                            "p-1 rounded-lg transition-colors",
                            activeTab === tab.id && "bg-primary/10"
                        )}>
                            {tab.id === "proxies" ? <Globe size={22} /> : React.cloneElement(tab.icon as React.ReactElement<{ size: number }>, { size: 22 })}
                        </div>
                        <span className="text-[10px] font-medium tracking-tight">
                            {tab.id === "proxies" ? t('sidebar.proxies', { defaultValue: 'Proxies' }) : tab.label}
                        </span>
                    </button>
                ))}
            </div>
        </nav>
    )
}

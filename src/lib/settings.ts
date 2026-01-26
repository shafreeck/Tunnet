import { invoke } from "@tauri-apps/api/core"
import { emit } from "@tauri-apps/api/event"

export interface AppSettings {
    // General
    theme?: string
    launch_at_login: boolean
    start_minimized: boolean
    auto_update: boolean
    auto_connect: boolean
    show_sidebar_status: boolean

    // Connection
    system_proxy: boolean
    allow_lan: boolean
    mixed_port: number
    tun_mode: boolean
    tun_stack: string
    tun_mtu: number
    strict_route: boolean

    // DNS
    dns_hijack: boolean
    dns_strategy: string
    dns_servers: string
    routing_mode?: string

    // Advanced
    log_level: string
    active_target_id?: string
}

export const defaultSettings: AppSettings = {
    theme: "system",
    launch_at_login: false,
    start_minimized: false,
    auto_update: true,
    auto_connect: false,
    show_sidebar_status: true,
    system_proxy: true,
    allow_lan: false,
    mixed_port: 2080,
    tun_mode: false,
    tun_stack: "gvisor",
    tun_mtu: 9000,
    strict_route: true,
    dns_hijack: true,
    dns_strategy: "ipv4",
    dns_servers: "8.8.8.8\n1.1.1.1",
    routing_mode: "rule",
    log_level: "info",
    active_target_id: undefined,
}

export async function getAppSettings(): Promise<AppSettings> {
    try {
        return await invoke<AppSettings>("get_app_settings")
    } catch (e) {
        console.error("Failed to get app settings", e)
        return defaultSettings
    }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
    try {
        await invoke("save_app_settings", { settings })
        // Optimistically emit update to all windows
        await emit("settings-update", settings)
    } catch (e) {
        console.error("Failed to save app settings", e)
        throw e
    }
}

export interface Rule {
    id: string
    type: "DOMAIN" | "DOMAIN_SUFFIX" | "DOMAIN_KEYWORD" | "IP_CIDR" | "GEOIP" | "FINAL" | "IP_IS_PRIVATE"
    value: string
    policy: string
    enabled: boolean
    description?: string
}

export const LEGACY_DESCRIPTION_MAP: Record<string, string> = {
    "Direct connection for Mainland China IPs": "rules.description.geoip_cn",
    "Direct connection for Mainland China Domains": "rules.description.geosite_cn",
    "Force Google via Proxy": "rules.description.google",
    "Local Network": "rules.description.local_network",
    "Block Ads": "rules.description.ads",
    "Default Fallback Policy": "rules.description.final_proxy"
}

export const PRESETS = {
    "Smart Connect": {
        defaultPolicy: "PROXY",
        rules: [
            { id: "private-rule", type: "IP_IS_PRIVATE", value: "true", policy: "DIRECT", enabled: true, description: "rules.description.private_network" },
            { id: "ads-1", type: "DOMAIN", value: "geosite:geosite-ads", policy: "REJECT", enabled: true, description: "rules.description.ads_blocking" },
            { id: "cn-1", type: "DOMAIN", value: "geosite:geosite-cn", policy: "DIRECT", enabled: true, description: "rules.description.china_all" },
            { id: "cn-2", type: "GEOIP", value: "geoip-cn", policy: "DIRECT", enabled: true, description: "rules.description.china_all" },
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
            { id: "lan-b", type: "IP_IS_PRIVATE", value: "true", policy: "DIRECT", enabled: true, description: "rules.description.private_network" },
            { id: "cn-b1", type: "GEOIP", value: "geoip-cn", policy: "DIRECT", enabled: true, description: "rules.description.geoip_cn" },
            { id: "cn-b2", type: "DOMAIN", value: "geosite:geosite-cn", policy: "DIRECT", enabled: true, description: "rules.description.geosite_cn" },
        ] as Rule[]
    }
}

export const getPresetName = (name: string, t: any) => {
    switch (name) {
        case "Smart Connect": return t('rules.preset.smart')
        case "Global Proxy": return t('rules.preset.global_proxy')
        case "Global Direct": return t('rules.preset.global_direct')
        case "Bypass LAN & CN": return t('rules.preset.bypass_lan_cn')
        case "Custom": return t('rules.preset.custom')
        default: return name
    }
}

export const areRuleSetsEqual = (a: Rule[], b: Rule[]) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        const r1 = a[i]
        const r2 = b[i]
        const equal = (
            r1.id === r2.id &&
            r1.type === r2.type &&
            String(r1.value) === String(r2.value) &&
            r1.policy === r2.policy &&
            r1.enabled === r2.enabled &&
            (r1.description || "") === (r2.description || "")
        )
        if (!equal) return false
    }
    return true
}

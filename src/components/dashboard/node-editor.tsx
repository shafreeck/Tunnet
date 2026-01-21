import { useState, useEffect } from "react"
import { X, Save, Check, ChevronDown, ChevronRight, Share2, Copy, QrCode } from "lucide-react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { toast } from "sonner"
import { QRModal } from "@/components/ui/qr-modal"

export interface Node {
    id: string
    name: string
    protocol: string
    server: string
    port: number
    uuid?: string
    cipher?: string
    password?: string
    tls?: boolean
    network?: string
    path?: string
    host?: string
    sni?: string
    alpn?: string[]
    insecure?: boolean
    fingerprint?: string
    flow?: string
    public_key?: string
    short_id?: string
    up?: string
    down?: string
}

interface NodeEditorProps {
    isOpen: boolean
    initialNode?: Node | null
    onClose: () => void
    onSave: (node: Node) => void
}

const PROTOCOLS = [
    { id: "vmess", name: "VMess" },
    { id: "vless", name: "VLESS" },
    { id: "trojan", name: "Trojan" },
    { id: "shadowsocks", name: "Shadowsocks" },
    { id: "hysteria2", name: "Hysteria2" },
    { id: "tuic", name: "TUIC" },
]

export function NodeEditor({ isOpen, initialNode, onClose, onSave }: NodeEditorProps) {
    const { t } = useTranslation()
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [qrValue, setQrValue] = useState<string>("")
    const [node, setNode] = useState<Node>({
        id: "",
        name: "New Node",
        protocol: "vmess",
        server: "",
        port: 443,
        uuid: "",
        cipher: "auto",
        tls: true,
        network: "ws",
        path: "/",
        host: "",
        insecure: false,
    })

    const handleShare = async (mode: 'copy' | 'qr') => {
        try {
            // We need to save the node first or at least convert current state to a link
            // But get_node_link relies on finding the node in backend profiles which might not be saved yet if "New Node"
            // If it is an existing node (initialNode exists), we can try specific logic.
            // BETTER: If we want to share *current edits*, we need backend helper `generate_link_from_node_struct`.
            // BUT: Plan says `get_node_link(id)`. 
            // LIMITATION: Only saved nodes can be shared for now to keep it simple as per plan.
            // OR we assume we only enable Share button if it's an existing node.

            if (!initialNode?.id) {
                toast.error(t('node_editor.save_first_to_share', { defaultValue: "Please save the node first to share" }))
                return
            }

            const link = await invoke<string>('get_node_link', { id: initialNode.id })

            if (mode === 'copy') {
                await writeText(link)
                toast.success(t('common.copied_link', { defaultValue: "Link copied to clipboard" }))
            } else {
                setQrValue(link)
            }
        } catch (e) {
            console.error(e)
            toast.error(t('common.share_failed', { defaultValue: "Failed to generate link" }))
        }
    }

    useEffect(() => {
        if (initialNode) {
            setNode({ ...initialNode })
        } else {
            // Reset to defaults for new node
            setNode({
                id: crypto.randomUUID(),
                name: "New Server",
                protocol: "vmess",
                server: "",
                port: 443,
                uuid: crypto.randomUUID(),
                cipher: "auto",
                tls: true,
                network: "ws",
                path: "/",
                host: "",
                insecure: false,
            })
        }
    }, [initialNode, isOpen])

    if (!isOpen) return null

    const handleChange = (field: keyof Node, value: any) => {
        setNode(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(node)
    }

    const hasUUID = ["vmess", "vless", "tuic"].includes(node.protocol)
    const hasPassword = ["trojan", "shadowsocks", "hysteria2", "tuic"].includes(node.protocol)
    const hasFlow = node.protocol === "vless"
    const hasHysteriaBW = node.protocol === "hysteria2"
    const hasReality = node.protocol === "vless" // simple assumption for Reality

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white/95 dark:bg-[#1a1b26]/95 backdrop-blur-xl border border-border-color rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-sidebar-bg">
                    <h2 className="text-lg font-semibold text-text-primary">
                        {initialNode ? t('node_editor.edit_node') : t('node_editor.add_node')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <form id="node-form" onSubmit={handleSubmit} className="space-y-5">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.name_remarks')}</label>
                                    <input
                                        type="text"
                                        value={node.name}
                                        onChange={e => handleChange("name", e.target.value)}
                                        className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-all"
                                        placeholder="My Server"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.protocol')}</label>
                                    <select
                                        value={node.protocol}
                                        onChange={e => handleChange("protocol", e.target.value)}
                                        className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-all appearance-none"
                                    >
                                        {PROTOCOLS.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2 space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.server_address')}</label>
                                    <input
                                        type="text"
                                        value={node.server}
                                        onChange={e => handleChange("server", e.target.value)}
                                        className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-primary/50 transition-all placeholder:text-text-tertiary"
                                        placeholder="example.com"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.port')}</label>
                                    <input
                                        type="number"
                                        value={node.port}
                                        onChange={e => handleChange("port", parseInt(e.target.value) || 0)}
                                        className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-primary/50 transition-all"
                                        placeholder="443"
                                        required
                                    />
                                </div>
                            </div>

                            {hasUUID && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.uuid')}</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={node.uuid || ""}
                                            onChange={e => handleChange("uuid", e.target.value)}
                                            className="flex-1 bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-primary/50 transition-all"
                                            placeholder="UUID"
                                            required={node.protocol !== "tuic"}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleChange("uuid", crypto.randomUUID())}
                                            className="px-3 py-1 bg-black/5 dark:bg-white/5 border border-border-color rounded-lg text-[10px] font-bold uppercase hover:bg-primary/10 hover:text-primary transition-all shrink-0"
                                        >
                                            Gen
                                        </button>
                                    </div>
                                </div>
                            )}

                            {hasPassword && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={`space-y-1.5 ${node.protocol === 'shadowsocks' ? '' : 'col-span-2'}`}>
                                        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.password')}</label>
                                        <input
                                            type="password"
                                            value={node.password || ""}
                                            onChange={e => handleChange("password", e.target.value)}
                                            className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-primary/50 transition-all"
                                            placeholder="Password"
                                            required
                                        />
                                    </div>
                                    {node.protocol === "shadowsocks" && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.security')}</label>
                                            <select
                                                value={node.cipher || "aes-128-gcm"}
                                                onChange={e => handleChange("cipher", e.target.value)}
                                                className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 transition-all appearance-none"
                                            >
                                                <option value="aes-128-gcm">AES-128-GCM</option>
                                                <option value="aes-256-gcm">AES-256-GCM</option>
                                                <option value="chacha20-poly1305">ChaCha20-P1305</option>
                                                <option value="2022-blake3-aes-128-gcm">2022-AES-128</option>
                                                <option value="2022-blake3-aes-256-gcm">2022-AES-256</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {hasHysteriaBW && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.up_mbps')}</label>
                                        <input
                                            type="text"
                                            value={node.up || ""}
                                            onChange={e => handleChange("up", e.target.value)}
                                            className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-primary/50 transition-all"
                                            placeholder="100"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">{t('node_editor.down_mbps')}</label>
                                        <input
                                            type="text"
                                            value={node.down || ""}
                                            onChange={e => handleChange("down", e.target.value)}
                                            className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-primary/50 transition-all"
                                            placeholder="100"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="h-px bg-border-color my-4" />

                        {/* Collapsible Advanced Settings */}
                        <div className="space-y-4">
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-2 text-xs font-bold text-secondary uppercase tracking-[0.1em] hover:text-primary transition-colors focus:outline-none group"
                            >
                                {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                {t('node_editor.advanced_settings')}
                            </button>

                            {showAdvanced && (
                                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                                    {/* TLS settings */}
                                    <div className="space-y-4 bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-border-color">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{t('node_editor.tls_settings')}</span>
                                            <div
                                                onClick={() => handleChange("tls", !node.tls)}
                                                className={`cursor-pointer transition-all ${node.tls ? 'text-primary' : 'text-tertiary'}`}
                                            >
                                                <div className={`flex items-center gap-2 text-[10px] font-bold uppercase`}>
                                                    <div className={`size-4 rounded border flex items-center justify-center ${node.tls ? 'bg-primary border-primary' : 'border-border-color'}`}>
                                                        {node.tls && <Check size={12} className="text-white" />}
                                                    </div>
                                                    {t('node_editor.enable_tls')}
                                                </div>
                                            </div>
                                        </div>

                                        {node.tls && (
                                            <div className="space-y-4 pt-2">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.sni')}</label>
                                                        <input
                                                            type="text"
                                                            value={node.sni || ""}
                                                            onChange={e => handleChange("sni", e.target.value)}
                                                            className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono focus:outline-none"
                                                            placeholder="example.com"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.fingerprint')}</label>
                                                        <select
                                                            value={node.fingerprint || "chrome"}
                                                            onChange={e => handleChange("fingerprint", e.target.value)}
                                                            className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none appearance-none"
                                                        >
                                                            <option value="chrome">Chrome</option>
                                                            <option value="firefox">Firefox</option>
                                                            <option value="safari">Safari</option>
                                                            <option value="edge">Edge</option>
                                                            <option value="random">Random</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.alpn')}</label>
                                                    <input
                                                        type="text"
                                                        value={node.alpn?.join(', ') || ""}
                                                        onChange={e => handleChange("alpn", e.target.value.split(',').map(s => s.trim()))}
                                                        className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono focus:outline-none"
                                                        placeholder="h2, http/1.1"
                                                    />
                                                </div>

                                                <div
                                                    onClick={() => handleChange("insecure", !node.insecure)}
                                                    className="flex items-center gap-2 cursor-pointer group"
                                                >
                                                    <div className={`size-4 rounded border flex items-center justify-center transition-all ${node.insecure ? 'bg-primary border-primary' : 'border-border-color group-hover:border-primary/50'}`}>
                                                        {node.insecure && <Check size={12} className="text-white" />}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">{t('node_editor.skip_cert_verify')}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Transport settings */}
                                    <div className="space-y-4 bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-border-color">
                                        <span className="text-[10px] font-bold text-secondary uppercase tracking-widest block">{t('node_editor.transport_settings')}</span>

                                        <div className="grid grid-cols-2 gap-4 pt-2">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.transport')}</label>
                                                <select
                                                    value={node.network || "tcp"}
                                                    onChange={e => handleChange("network", e.target.value)}
                                                    className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none appearance-none"
                                                >
                                                    <option value="tcp">TCP</option>
                                                    <option value="ws">WebSocket (WS)</option>
                                                    <option value="grpc">gRPC</option>
                                                    <option value="h2">HTTP/2</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.security')}</label>
                                                <select
                                                    value={node.cipher || "auto"}
                                                    onChange={e => handleChange("cipher", e.target.value)}
                                                    className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none appearance-none"
                                                >
                                                    <option value="auto">Auto</option>
                                                    <option value="chacha20-poly1305">ChaCha20</option>
                                                    <option value="none">None</option>
                                                </select>
                                            </div>
                                        </div>

                                        {(node.network === "ws" || node.network === "grpc" || node.network === "h2") && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.ws_path')}</label>
                                                    <input
                                                        type="text"
                                                        value={node.path || "/"}
                                                        onChange={e => handleChange("path", e.target.value)}
                                                        className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono focus:outline-none"
                                                        placeholder="/"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.ws_host')}</label>
                                                    <input
                                                        type="text"
                                                        value={node.host || ""}
                                                        onChange={e => handleChange("host", e.target.value)}
                                                        className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono focus:outline-none"
                                                        placeholder="Host Header"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Protocol specific advanced fields */}
                                    {hasFlow && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider">{t('node_editor.flow')}</label>
                                            <select
                                                value={node.flow || "none"}
                                                onChange={e => handleChange("flow", e.target.value)}
                                                className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none appearance-none"
                                            >
                                                <option value="none">None</option>
                                                <option value="xtls-rprx-vision">Vision</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border-color bg-sidebar-bg flex items-center justify-between shrink-0">
                    <div className="flex gap-2">
                        {initialNode && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleShare('copy')}
                                    className="p-2 text-text-secondary hover:text-primary transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                                    title={t('common.copy_link', { defaultValue: "Copy Link" })}
                                >
                                    <Copy size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleShare('qr')}
                                    className="p-2 text-text-secondary hover:text-primary transition-colors rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                                    title={t('common.qr_code', { defaultValue: "QR Code" })}
                                >
                                    <QrCode size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                        >
                            {t('node_editor.cancel')}
                        </button>
                        <button
                            type="submit"
                            form="node-form"
                            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
                        >
                            <Save size={16} />
                            {t('node_editor.save_node')}
                        </button>
                    </div>
                </div>
            </div>

            <QRModal
                isOpen={!!qrValue}
                onClose={() => setQrValue("")}
                value={qrValue}
            />
        </div>
    )
}

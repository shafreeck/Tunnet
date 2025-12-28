import { useState, useEffect } from "react"
import { X, Save, Check } from "lucide-react"

export interface Node {
    id: string
    name: string
    protocol: string
    server: string
    port: number
    uuid?: string
    cipher?: string
    tls?: boolean
    network?: string
    path?: string
    host?: string
    // Add other fields as needed matching backend struct
}

interface NodeEditorProps {
    isOpen: boolean
    initialNode?: Node | null
    onClose: () => void
    onSave: (node: Node) => void
}

export function NodeEditor({ isOpen, initialNode, onClose, onSave }: NodeEditorProps) {
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
        host: ""
    })

    useEffect(() => {
        if (initialNode) {
            setNode({ ...initialNode })
        } else {
            // Reset to defaults for new node
            setNode({
                id: "",
                name: "New Server",
                protocol: "vmess",
                server: "",
                port: 443,
                uuid: crypto.randomUUID(),
                cipher: "auto",
                tls: true,
                network: "ws",
                path: "/",
                host: ""
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#1a1b26]/90 border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                    <h2 className="text-lg font-semibold text-white">
                        {initialNode ? "Edit Node" : "Add Node"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <form id="node-form" onSubmit={handleSubmit} className="space-y-5">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Name (Remarks)</label>
                                    <input
                                        type="text"
                                        value={node.name}
                                        onChange={e => handleChange("name", e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-white/20"
                                        placeholder="My Server"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2 space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Server Address</label>
                                    <input
                                        type="text"
                                        value={node.server}
                                        onChange={e => handleChange("server", e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-primary/50 transition-all placeholder:text-white/20"
                                        placeholder="example.com"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Port</label>
                                    <input
                                        type="number"
                                        value={node.port}
                                        onChange={e => handleChange("port", parseInt(e.target.value) || 0)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-primary/50 transition-all"
                                        placeholder="443"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">UUID</label>
                                <input
                                    type="text"
                                    value={node.uuid || ""}
                                    onChange={e => handleChange("uuid", e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-primary/50 transition-all placeholder:text-white/20"
                                    placeholder="e.g. 123e4567-e89b-..."
                                    required
                                />
                            </div>
                        </div>

                        <div className="h-px bg-white/5 my-2" />

                        {/* Advanced Settings */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Transport</label>
                                    <select
                                        value={node.network || "tcp"}
                                        onChange={e => handleChange("network", e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all appearance-none"
                                    >
                                        <option value="tcp">TCP</option>
                                        <option value="ws">WebSocket (WS)</option>
                                        <option value="grpc">gRPC</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Security</label>
                                    <select
                                        value={node.cipher || "auto"}
                                        onChange={e => handleChange("cipher", e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all appearance-none"
                                    >
                                        <option value="auto">Auto</option>
                                        <option value="aes-128-gcm">AES-128-GCM</option>
                                        <option value="chacha20-poly1305">ChaCha20-Poly1305</option>
                                        <option value="none">None</option>
                                    </select>
                                </div>
                            </div>

                            {node.network === "ws" && (
                                <div className="grid grid-cols-2 gap-4 bg-white/5 p-3 rounded-lg border border-white/5">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">WS Path</label>
                                        <input
                                            type="text"
                                            value={node.path || "/"}
                                            onChange={e => handleChange("path", e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-primary/50"
                                            placeholder="/"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">WS Host</label>
                                        <input
                                            type="text"
                                            value={node.host || ""}
                                            onChange={e => handleChange("host", e.target.value)}
                                            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-primary/50"
                                            placeholder="Host Header"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => handleChange("tls", !node.tls)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${node.tls ? 'bg-primary/20 border-primary/50 text-white' : 'bg-black/20 border-white/10 text-white/50'}`}
                            >
                                <div className={`size-4 rounded border flex items-center justify-center ${node.tls ? 'bg-primary border-primary' : 'border-white/30'}`}>
                                    {node.tls && <Check size={12} className="text-white" />}
                                </div>
                                <span className="text-sm font-medium">Enable TLS</span>
                            </button>
                        </div>

                    </form>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-white/5 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="node-form"
                        className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-95"
                    >
                        <Save size={16} />
                        Save Node
                    </button>
                </div>
            </div>
        </div>
    )
}

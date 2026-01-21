import { useState, useEffect } from "react"
import { X, Clipboard, Link, Plus, QrCode, Edit3 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AddNodeModalProps {
    isOpen: boolean
    onClose: () => void
    onManual?: () => void
    onImport: (url: string) => void
    title?: string
}

export function AddNodeModal({ isOpen, onClose, onManual, onImport, title }: AddNodeModalProps) {
    const { t } = useTranslation()
    const [urlInput, setUrlInput] = useState("")

    if (!isOpen) return null

    const handleClipboardImport = async () => {
        try {
            // Use Tauri plugin for clipboard access to avoid permission issues
            const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
            const text = await readText();
            if (text && text.trim().length > 0) {
                onImport(text.trim())
                onClose()
            } else {
                toast.error(t('clipboard_empty', { defaultValue: "Clipboard is empty or permissions denied" }))
            }
        } catch (e) {
            console.error("Clipboard error:", e)
            // Fallback to manual prompt or alert
            try {
                // Fallback to native web API
                const text = await navigator.clipboard.readText()
                if (text && text.trim().length > 0) {
                    onImport(text.trim())
                    onClose()
                    return
                }
            } catch (webErr) {
                console.error("Web Clipboard error:", webErr)
            }
            toast.error(t('clipboard_read_failed', { defaultValue: "Failed to read clipboard" }))
        }
    }

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (urlInput.trim()) {
            onImport(urlInput.trim())
            onClose()
            setUrlInput("")
        }
    }

    const handleScanQR = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const { invoke } = await import('@tauri-apps/api/core');

            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Image',
                    extensions: ['png', 'jpg', 'jpeg']
                }]
            });

            if (selected && typeof selected === 'string') {
                const content = await invoke<string>('decode_qr', { path: selected });
                if (content) {
                    onImport(content);
                    onClose();
                }
            }
        } catch (e) {
            console.error("QR Scan error:", e);
            toast.error(t('qr_scan_failed', { defaultValue: "Failed to scan QR code" }));
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-surface border border-border-color rounded-3xl shadow-floating overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-300 ease-out">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-sidebar-bg">
                    <h2 className="text-lg font-semibold text-text-primary">{title || t('add_connection', { defaultValue: "Add Connection" })}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className={cn("p-8 grid gap-4", onManual ? "grid-cols-3" : "grid-cols-2")}>
                    {/* Option 1: Clipboard */}
                    <button
                        onClick={handleClipboardImport}
                        className="flex flex-col items-center justify-center gap-4 p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-color hover:bg-black/10 dark:hover:bg-white/10 hover:border-primary/50 transition-all group active:scale-95"
                    >
                        <div className="p-3.5 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                            <Clipboard size={22} />
                        </div>
                        <span className="text-xs font-bold text-text-secondary group-hover:text-text-primary text-center">
                            {t('import_from_clipboard', { defaultValue: "Import from Clipboard" })}
                        </span>
                    </button>

                    {/* Option 2: Scan QR */}
                    <button
                        onClick={handleScanQR}
                        className="flex flex-col items-center justify-center gap-4 p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-color hover:bg-black/10 dark:hover:bg-white/10 hover:border-emerald-500/50 transition-all group active:scale-95"
                    >
                        <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                            <QrCode size={22} />
                        </div>
                        <span className="text-xs font-bold text-text-secondary group-hover:text-text-primary text-center">
                            {t('scan_qr_code', { defaultValue: "Scan QR Code" })}
                        </span>
                    </button>

                    {/* Option 3: Manual */}
                    {onManual && (
                        <button
                            onClick={() => {
                                onClose()
                                onManual()
                            }}
                            className="flex flex-col items-center justify-center gap-4 p-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-color hover:bg-black/10 dark:hover:bg-white/10 hover:border-purple-500/50 transition-all group active:scale-95"
                        >
                            <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all duration-300">
                                <Edit3 size={22} />
                            </div>
                            <span className="text-xs font-bold text-text-secondary group-hover:text-text-primary text-center">
                                {t('manual_configuration', { defaultValue: "Manual Configuration" })}
                            </span>
                        </button>
                    )}
                </div>

                {/* URL Input Area */}
                <div className="px-8 pb-8">
                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-border-color"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-surface px-4 text-xs font-bold text-text-tertiary uppercase tracking-widest leading-none">
                                {t('or_paste_link', { defaultValue: "Or paste link" })}
                            </span>
                        </div>
                    </div>

                    <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
                        <div className="relative flex-1">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
                                <Link size={18} />
                            </div>
                            <input
                                type="text"
                                value={urlInput}
                                onChange={e => setUrlInput(e.target.value)}
                                placeholder={t('paste_link_placeholder', { defaultValue: "vmess://... or subscription url" })}
                                className="w-full bg-black/5 dark:bg-white/5 border border-border-color rounded-2xl pl-12 pr-4 py-4 text-sm font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-text-tertiary"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!urlInput}
                            className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-primary/25 transition-all active:scale-95"
                        >
                            {t('import', { defaultValue: "Import" })}
                        </button>
                    </form>
                </div>

            </div>
        </div>
    )
}

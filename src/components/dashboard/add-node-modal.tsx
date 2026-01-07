import { useState, useEffect } from "react"
import { X, Clipboard, Link, Plus, ScanLine, Edit3 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

interface AddNodeModalProps {
    isOpen: boolean
    onClose: () => void
    onManual: () => void
    onImport: (url: string) => void
}

export function AddNodeModal({ isOpen, onClose, onManual, onImport }: AddNodeModalProps) {
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white/95 dark:bg-[#1a1b26]/95 backdrop-blur-xl border border-border-color rounded-xl shadow-2xl overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-sidebar-bg">
                    <h2 className="text-lg font-semibold text-text-primary">{t('add_connection', { defaultValue: "Add Connection" })}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-2 gap-4">
                    {/* Option 1: Clipboard */}
                    <button
                        onClick={handleClipboardImport}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-black/5 dark:bg-white/5 border border-border-color hover:bg-black/10 dark:hover:bg-white/10 hover:border-primary/50 transition-all group active:scale-95"
                    >
                        <div className="p-3 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                            <Clipboard size={24} />
                        </div>
                        <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary text-center">
                            {t('import_from_clipboard', { defaultValue: "Import from Clipboard" })}
                        </span>
                    </button>

                    {/* Option 2: Manual */}
                    <button
                        onClick={() => {
                            onClose()
                            onManual()
                        }}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-black/5 dark:bg-white/5 border border-border-color hover:bg-black/10 dark:hover:bg-white/10 hover:border-purple-500/50 transition-all group active:scale-95"
                    >
                        <div className="p-3 rounded-full bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                            <Edit3 size={24} />
                        </div>
                        <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary text-center">
                            {t('manual_configuration', { defaultValue: "Manual Configuration" })}
                        </span>
                    </button>

                    {/* Option 3: Scan QR (Placeholder) */}
                    <button
                        onClick={() => toast.info("QR Scan not implemented yet")}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-black/5 dark:bg-white/5 border border-border-color hover:bg-black/10 dark:hover:bg-white/10 hover:border-blue-500/50 transition-all group active:scale-95 opacity-50 cursor-not-allowed"
                    >
                        <div className="p-3 rounded-full bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                            <ScanLine size={24} />
                        </div>
                        <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary text-center">
                            {t('scan_qr_code', { defaultValue: "Scan QR Code" })}
                        </span>
                    </button>

                    {/* Option 4: Placeholder or Empty for grid balance */}
                    <div className="hidden sm:block" />
                </div>

                {/* URL Input Area */}
                <div className="px-6 pb-6 pt-2">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-border-color"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-card-bg px-2 text-xs text-text-secondary uppercase">
                                {t('or_paste_link', { defaultValue: "Or paste link" })}
                            </span>
                        </div>
                    </div>

                    <form onSubmit={handleUrlSubmit} className="mt-4 flex gap-2">
                        <div className="relative flex-1">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                                <Link size={14} />
                            </div>
                            <input
                                type="text"
                                value={urlInput}
                                onChange={e => setUrlInput(e.target.value)}
                                placeholder={t('paste_link_placeholder', { defaultValue: "vmess://... or subscription url" })}
                                className="w-full bg-black/5 dark:bg-black/20 border border-border-color rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary/50 placeholder:text-text-tertiary"
                                onPaste={(e) => {
                                    // Optional: If you want to handle paste directly, but default behavior handles text paste fine.
                                    // Right click paste should also work natively on inputs.
                                }}

                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!urlInput}
                            className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 rounded-lg font-medium text-sm transition-colors"
                        >
                            {t('import', { defaultValue: "Import" })}
                        </button>
                    </form>
                </div>

            </div>
        </div>
    )
}

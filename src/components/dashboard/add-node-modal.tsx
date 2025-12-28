import { useState } from "react"
import { X, Clipboard, Link, Plus, ScanLine, Edit3 } from "lucide-react"

interface AddNodeModalProps {
    isOpen: boolean
    onClose: () => void
    onManual: () => void
    onImport: (url: string) => void
}

export function AddNodeModal({ isOpen, onClose, onManual, onImport }: AddNodeModalProps) {
    const [urlInput, setUrlInput] = useState("")

    if (!isOpen) return null

    const handleClipboardImport = async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (text) {
                onImport(text)
                onClose()
            } else {
                alert("Clipboard is empty or permission denied")
            }
        } catch (e) {
            console.error("Clipboard error:", e)
            // Fallback or alert
            alert("Failed to read clipboard. Please paste manually.")
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-[#1a1b26]/90 border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                    <h2 className="text-lg font-semibold text-white">Add Connection</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-2 gap-4">
                    {/* Option 1: Clipboard */}
                    <button
                        onClick={handleClipboardImport}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-primary/50 transition-all group active:scale-95"
                    >
                        <div className="p-3 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                            <Clipboard size={24} />
                        </div>
                        <span className="text-sm font-medium text-gray-200 group-hover:text-white">Import from Clipboard</span>
                    </button>

                    {/* Option 2: Manual */}
                    <button
                        onClick={() => {
                            onClose()
                            onManual()
                        }}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-purple-500/50 transition-all group active:scale-95"
                    >
                        <div className="p-3 rounded-full bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                            <Edit3 size={24} />
                        </div>
                        <span className="text-sm font-medium text-gray-200 group-hover:text-white">Manual Configuration</span>
                    </button>

                    {/* Option 3: Scan QR (Placeholder) */}
                    <button
                        onClick={() => alert("QR Scan not implemented yet")}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-blue-500/50 transition-all group active:scale-95 opacity-50 cursor-not-allowed"
                    >
                        <div className="p-3 rounded-full bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                            <ScanLine size={24} />
                        </div>
                        <span className="text-sm font-medium text-gray-200 group-hover:text-white">Scan QR Code</span>
                    </button>

                    {/* Option 4: Placeholder or Empty for grid balance */}
                    <div className="hidden sm:block" />
                </div>

                {/* URL Input Area */}
                <div className="px-6 pb-6 pt-2">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-[#1a1b26] px-2 text-xs text-text-secondary uppercase">Or paste link</span>
                        </div>
                    </div>

                    <form onSubmit={handleUrlSubmit} className="mt-4 flex gap-2">
                        <div className="relative flex-1">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                                <Link size={14} />
                            </div>
                            <input
                                type="text"
                                value={urlInput}
                                onChange={e => setUrlInput(e.target.value)}
                                placeholder="vmess://... or subscription url"
                                className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50 placeholder:text-white/20"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!urlInput}
                            className="bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 rounded-lg font-medium text-sm transition-colors"
                        >
                            Import
                        </button>
                    </form>
                </div>

            </div>
        </div>
    )
}

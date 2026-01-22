"use client"

import { useState, useEffect } from "react"
import { X, Clipboard, Link, Plus, QrCode, Edit3, FileText, Upload } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AddNodeModalProps {
    isOpen: boolean
    onClose: () => void
    onManual?: () => void
    onImport: (url: string, name?: string) => void
    title?: string
}

export function AddNodeModal({ isOpen, onClose, onManual, onImport, title }: AddNodeModalProps) {
    const { t } = useTranslation()
    const [urlInput, setUrlInput] = useState("")
    const [isDragging, setIsDragging] = useState(false)

    // Tauri-specific drag-drop listener
    useEffect(() => {
        let unlistenFuncs: (() => void)[] = [];
        let active = true;

        const setupListeners = async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                if (!active) return;

                // 2. Drag Enter (Visual Feedback)
                unlistenFuncs.push(await listen('tauri://drag-enter', () => {
                    if (active) setIsDragging(true);
                }));

                // 3. Drag Leave (Visual Feedback Cleaning)
                unlistenFuncs.push(await listen('tauri://drag-leave', () => {
                    if (active) setIsDragging(false);
                }));

            } catch (e) {
                console.warn("Failed to setup drag listeners:", e);
            }
        };

        if (isOpen) {
            setupListeners();
        }

        return () => {
            active = false;
            unlistenFuncs.forEach(fn => fn());
            unlistenFuncs = [];
        }
    }, [isOpen, onImport, onClose]);

    if (!isOpen) return null

    const handleClipboardImport = async () => {
        try {
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
            try {
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

    const handleFileImport = async () => {
        try {
            // Import only what's needed immediately to avoid resolution overhead
            const { open } = await import('@tauri-apps/plugin-dialog');

            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Configuration',
                    extensions: ['json', 'yaml', 'yml', 'txt', 'conf']
                }]
            });

            if (selected && typeof selected === 'string') {
                // Only import FS when we actually have a file to read
                const { readTextFile } = await import('@tauri-apps/plugin-fs');
                const content = await readTextFile(selected);
                if (content) {
                    const filename = selected.split(/[\/\\]/).pop() || "";
                    onImport(content, filename.replace(/\.[^/.]+$/, ""));
                    onClose();
                }
            }
        } catch (e) {
            console.error("File import error:", e);
            toast.error(t('file_import_failed', { defaultValue: "Failed to import from file" }));
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const rect = e.currentTarget.getBoundingClientRect();
        if (
            e.clientX <= rect.left ||
            e.clientX >= rect.right ||
            e.clientY <= rect.top ||
            e.clientY >= rect.bottom
        ) {
            setIsDragging(false);
        }
    }


    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            <div className={cn(
                "w-full max-w-lg bg-surface border border-border-color rounded-[2rem] shadow-2xl overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-500 ease-out relative transition-all",
                isDragging && "ring-4 ring-primary/20 border-primary bg-primary/5"
            )}>
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-primary/10 flex items-center justify-center pointer-events-none border-4 border-dashed border-primary m-3 rounded-2xl backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                            <div className="p-5 rounded-full bg-primary text-white shadow-xl shadow-primary/40 animate-bounce">
                                <Upload size={40} />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <span className="text-xl font-black text-primary uppercase tracking-tight">{t('drop_to_import')}</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between px-8 py-4 border-b border-border-color bg-sidebar-bg/50">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-black text-text-primary uppercase tracking-tight">{title || t('add_connection')}</h2>
                        <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest mt-0.5">{t('import_subtitle')}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-text-tertiary hover:text-red-500 transition-all active:scale-90"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8">
                    <div className={cn(
                        "grid gap-3 mb-6",
                        onManual ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
                    )}>
                        {/* Option 1: Clipboard */}
                        <button
                            onClick={handleClipboardImport}
                            className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-black/3 dark:bg-white/3 border border-border-color hover:bg-primary/5 hover:border-primary/30 transition-all group active:scale-95 shadow-sm"
                        >
                            <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                                <Clipboard size={20} />
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-primary text-center leading-tight">
                                {t('import_from_clipboard', { defaultValue: "Clipboard" })}
                            </span>
                        </button>

                        {/* Option 2: Choose File */}
                        <button
                            onClick={handleFileImport}
                            className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-black/3 dark:bg-white/3 border border-border-color hover:bg-blue-500/5 hover:border-blue-500/30 transition-all group active:scale-95 shadow-sm"
                        >
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
                                <FileText size={20} />
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-blue-500 text-center leading-tight">
                                {t('choose_from_file')}
                                <span className="block mt-0.5 opacity-50 font-medium normal-case text-[8px]">{t('drag_hint')}</span>
                            </span>
                        </button>

                        {/* Option 3: Scan QR */}
                        <button
                            onClick={handleScanQR}
                            className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-black/3 dark:bg-white/3 border border-border-color hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-all group active:scale-95 shadow-sm"
                        >
                            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                                <QrCode size={20} />
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-emerald-500 text-center leading-tight">
                                {t('scan_qr_code')}
                            </span>
                        </button>

                        {/* Option 4: Manual */}
                        {onManual && (
                            <button
                                onClick={() => {
                                    onClose()
                                    onManual()
                                }}
                                className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-black/3 dark:bg-white/3 border border-border-color hover:bg-purple-500/5 hover:border-purple-500/30 transition-all group active:scale-95 shadow-sm"
                            >
                                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all duration-300">
                                    <Edit3 size={20} />
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary group-hover:text-purple-500 text-center leading-tight">
                                    {t('manual_configuration')}
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Visual Drag Drop Guide - More Subtle */}
                    <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-full bg-black/2 dark:bg-white/2 border border-border-color/30">
                        <Upload size={10} className="text-primary/60" />
                        <span className="text-[9px] font-medium text-text-tertiary uppercase tracking-widest">
                            {t('drag_drop_guide')}
                        </span>
                    </div>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-border-color/50"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-surface px-4 text-[9px] font-black text-text-tertiary uppercase tracking-[0.2em] leading-none">
                                {t('or_paste_link')}
                            </span>
                        </div>
                    </div>

                    <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4">
                        <div className="relative group">
                            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-primary transition-colors">
                                <Link size={18} />
                            </div>
                            <input
                                type="text"
                                value={urlInput}
                                onChange={e => setUrlInput(e.target.value)}
                                placeholder={t('paste_link_placeholder')}
                                className="w-full bg-black/3 dark:bg-white/3 border border-border-color rounded-2xl pl-12 pr-6 py-4 text-xs font-bold text-text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/30 transition-all placeholder:text-text-tertiary/60 placeholder:font-medium"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!urlInput}
                            className="bg-primary hover:bg-primary/90 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all active:scale-95"
                        >
                            {t('import_now')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

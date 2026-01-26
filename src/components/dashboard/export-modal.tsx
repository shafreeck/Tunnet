import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useTranslation } from "react-i18next"
import { Copy, FileDown, QrCode, Check, Share2, FileJson, Link, Zap } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { QRModal } from "@/components/ui/qr-modal"

interface ExportModalProps {
    isOpen: boolean
    onClose: () => void
    targetId: string
    targetName: string
    targetType: "node" | "profile" | "group" | "all-nodes"
}

export function ExportModal({ isOpen, onClose, targetId, targetName, targetType }: ExportModalProps) {
    const { t } = useTranslation()
    const [format, setFormat] = useState<"sip002" | "tunnet" | "json">("sip002")
    const [isLoading, setIsLoading] = useState(false)
    const [qrValue, setQrValue] = useState("")

    const handleAction = async (action: "copy" | "qr" | "file") => {
        setIsLoading(true)
        try {
            const commandMap = {
                "node": "export_node_content",
                "profile": "export_profile_content",
                "group": "export_group_content",
                "all-nodes": "export_all_nodes"
            }
            const command = commandMap[targetType]
            const invokeArgs = targetType === "all-nodes" ? { format } : { id: targetId, format }
            const content = await invoke<string>(command, invokeArgs)

            if (action === "copy") {
                await writeText(content)
                toast.success(t('common.copied', { defaultValue: "Copied to clipboard" }))
                onClose()
            } else if (action === "qr") {
                if (content.length > 2000) {
                    toast.warning(t('export.qr_too_long', { defaultValue: "Content too long for QR code" }))
                    // Setup QR value anyway but warn
                }
                setQrValue(content)
            } else if (action === "file") {
                const ext = format === "json" ? "json" : "txt"
                const path = await save({
                    defaultPath: `${targetName.replace(/\s+/g, '_')}_export.${ext}`,
                    filters: [{
                        name: format === "json"
                            ? t('export.filter_json', { defaultValue: "Sing-box Config" })
                            : t('export.filter_links', { defaultValue: "Subscription Links" }),
                        extensions: [ext]
                    }]
                })

                if (path) {
                    await writeTextFile(path, content)
                    toast.success(t('export.saved_file', { defaultValue: "File saved successfully" }))
                    onClose()
                }
            }
        } catch (e) {
            console.error(e)
            toast.error(t('export.failed', { defaultValue: "Export failed", error: String(e) }))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-md p-0">
                    <div className="flex items-center justify-between px-8 py-5 border-b border-border-color bg-sidebar-bg/50">
                        <div className="flex flex-col">
                            <DialogTitle className="text-lg font-black text-text-primary uppercase tracking-tight">
                                {t('export.title', { defaultValue: "Export" })}
                            </DialogTitle>
                            <span className="text-[10px] font-bold text-text-tertiary tracking-widest mt-0.5">
                                <span className="uppercase">{t(`export.target_${targetType}`)}:</span> {targetType === "all-nodes" ? t('export.all_nodes_name', { defaultValue: "All Available Nodes" }) : (targetName.toLowerCase() === "local import" || targetName.toLowerCase() === "本地导入" ? t('subscriptions.local_import') : targetName)}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-8 px-8 py-8">
                        {/* Format Selection */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">{t('export.format', { defaultValue: "Format" })}</label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setFormat("sip002")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        format === "sip002"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10 text-text-secondary"
                                    )}
                                >
                                    <Link size={18} />
                                    <span className="text-[10px] font-bold">{t('export.type_links', { defaultValue: "Standard" })}</span>
                                </button>
                                <button
                                    onClick={() => setFormat("tunnet")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        format === "tunnet"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10 text-text-secondary"
                                    )}
                                >
                                    <Zap size={18} />
                                    <span className="text-[10px] font-bold">{t('export.type_tunnet', { defaultValue: "Tunnet" })}</span>
                                </button>
                                <button
                                    onClick={() => setFormat("json")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                                        format === "json"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10 text-text-secondary"
                                    )}
                                >
                                    <FileJson size={18} />
                                    <span className="text-[10px] font-bold">{t('export.type_json', { defaultValue: "JSON" })}</span>
                                </button>
                            </div>

                            <div className="mt-2 px-1 min-h-[32px] flex items-center">
                                <p key={format} className="text-[11px] leading-relaxed text-text-tertiary animate-in fade-in slide-in-from-top-1 duration-300">
                                    {format === "sip002" && t('export.type_links_desc')}
                                    {format === "tunnet" && t('export.type_tunnet_desc')}
                                    {format === "json" && t('export.type_json_desc')}
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-text-tertiary uppercase tracking-wider">{t('export.action', { defaultValue: "Action" })}</label>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => handleAction("copy")}
                                    disabled={isLoading}
                                    className="flex items-center justify-between p-4 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-text-primary transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-text-secondary group-hover:text-primary transition-colors">
                                            <Copy size={16} />
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="text-sm font-bold">{t('export.copy_content', { defaultValue: "Copy to Clipboard" })}</span>
                                            <span className="text-xs text-text-tertiary">{t('export.copy_desc', { defaultValue: "Copy the raw content" })}</span>
                                        </div>
                                    </div>
                                    <Share2 size={16} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                </button>

                                <button
                                    onClick={() => handleAction("qr")}
                                    disabled={isLoading}
                                    className="flex items-center justify-between p-4 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-text-primary transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-text-secondary group-hover:text-primary transition-colors">
                                            <QrCode size={16} />
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="text-sm font-bold">{t('export.show_qr', { defaultValue: "Show QR Code" })}</span>
                                            <span className="text-xs text-text-tertiary">{t('export.qr_desc', { defaultValue: "Display content as QR code" })}</span>
                                        </div>
                                    </div>
                                    <Share2 size={16} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                </button>

                                <button
                                    onClick={() => handleAction("file")}
                                    disabled={isLoading}
                                    className="flex items-center justify-between p-4 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-text-primary transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center text-text-secondary group-hover:text-primary transition-colors">
                                            <FileDown size={16} />
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="text-sm font-bold">{t('export.save_file', { defaultValue: "Save to File" })}</span>
                                            <span className="text-xs text-text-tertiary">{t('export.save_desc', { defaultValue: "Export content to a local file" })}</span>
                                        </div>
                                    </div>
                                    <Share2 size={16} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                </button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <QRModal
                isOpen={!!qrValue}
                onClose={() => setQrValue("")}
                value={qrValue}
            />
        </>
    )
}

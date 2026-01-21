import { X, Copy, Check } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"

interface QRModalProps {
    isOpen: boolean
    onClose: () => void
    value: string
    title?: string
}

export function QRModal({ isOpen, onClose, value, title }: QRModalProps) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await writeText(value)
            setCopied(true)
            toast.success(t('common.copied', { defaultValue: "Copied to clipboard" }))
            setTimeout(() => setCopied(false), 2000)
        } catch (e) {
            toast.error(t('common.copy_failed', { defaultValue: "Failed to copy" }))
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-white dark:bg-[#1a1a1a] border-border-color">
                <DialogHeader className="flex flex-row items-center justify-between">
                    <DialogTitle className="text-xl font-bold">{title || t('common.scan_qr', { defaultValue: "Scan QR Code" })}</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center p-6 gap-6 overflow-hidden">
                    <div className="p-4 bg-white rounded-2xl border border-border-color shadow-sm shrink-0">
                        {value.length > 2500 ? (
                            <div className="flex flex-col items-center justify-center w-[200px] h-[200px] text-center gap-2">
                                <span className="text-sm font-bold text-red-500">
                                    {t('common.qr_too_long', { defaultValue: "Data too long" })}
                                </span>
                                <span className="text-xs text-text-tertiary">
                                    {t('common.use_copy', { defaultValue: "Please use Copy Text" })}
                                </span>
                            </div>
                        ) : (
                            <QRCodeSVG
                                value={value}
                                size={200}
                                level="M"
                                fgColor="#000000"
                                bgColor="#ffffff"
                                marginSize={0}
                            />
                        )}
                    </div>

                    <div className="w-full flex items-center gap-2 px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-border-color min-w-0">
                        <div className="flex-1 font-mono text-[10px] text-text-secondary truncate select-all min-w-0">
                            {value}
                        </div>
                        <button
                            onClick={handleCopy}
                            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors text-text-tertiary hover:text-primary shrink-0"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

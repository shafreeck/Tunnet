import { X, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"

interface ConfirmationModalProps {
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => void
    onCancel: () => void
    isDanger?: boolean
}

export function ConfirmationModal({
    isOpen,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
    isDanger = false
}: ConfirmationModalProps) {
    const [animate, setAnimate] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setAnimate(true)
        } else {
            setAnimate(false)
        }
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-surface border border-border-color rounded-3xl shadow-floating overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-300 ease-out">
                <div className="p-8 flex flex-col items-center text-center gap-6">
                    <div className={`p-4 rounded-2xl ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
                        <AlertTriangle size={32} />
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-text-primary tracking-tight">{title}</h3>
                        <p className="text-sm text-text-secondary font-medium leading-relaxed px-2">{message}</p>
                    </div>

                    <div className="flex gap-3 w-full pt-2">
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-3.5 text-sm font-bold text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl transition-all active:scale-95"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 px-4 py-3.5 text-sm font-bold text-white rounded-2xl shadow-lg transition-all active:scale-95 ${isDanger
                                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/25'
                                : 'bg-primary hover:bg-primary/90 shadow-primary/25'
                                }`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

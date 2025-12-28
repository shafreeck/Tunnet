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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-[#1a1b26] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200">
                <div className="p-6 flex flex-col items-center text-center gap-4">
                    <div className={`p-3 rounded-full ${isDanger ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
                        <AlertTriangle size={32} />
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-white">{title}</h3>
                        <p className="text-sm text-text-secondary">{message}</p>
                    </div>

                    <div className="flex gap-3 w-full mt-2">
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-2 text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors border border-transparent"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg shadow-lg transition-all active:scale-95 ${isDanger
                                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                                    : 'bg-primary hover:bg-primary/90 shadow-primary/20'
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

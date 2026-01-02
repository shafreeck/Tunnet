import { Edit2, X } from "lucide-react"
import { useEffect, useState, useRef } from "react"

interface InputModalProps {
    isOpen: boolean
    title: string
    message?: string
    defaultValue?: string
    placeholder?: string
    confirmText?: string
    cancelText?: string
    onConfirm: (value: string) => void
    onCancel: () => void
}

export function InputModal({
    isOpen,
    title,
    message,
    defaultValue = "",
    placeholder = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
}: InputModalProps) {
    const [value, setValue] = useState(defaultValue)
    const [animate, setAnimate] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isOpen) {
            setAnimate(true)
            setValue(defaultValue)
            // Focus input after a small delay to allow animation to start
            setTimeout(() => inputRef.current?.focus(), 50)
        } else {
            setAnimate(false)
        }
    }, [isOpen, defaultValue])

    if (!isOpen) return null

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onConfirm(value)
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-[#1a1b26] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200">
                <div className="p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-full bg-primary/10 text-primary">
                            <Edit2 size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">{title}</h3>
                            {message && <p className="text-xs text-text-secondary">{message}</p>}
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input
                            ref={inputRef}
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={placeholder}
                            className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder:text-text-tertiary focus:outline-none focus:border-primary/50 transition-colors"
                        />

                        <div className="flex gap-3 w-full">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="flex-1 px-4 py-2 text-sm font-medium text-text-secondary hover:text-white hover:bg-white/5 rounded-lg transition-colors border border-transparent"
                            >
                                {cancelText}
                            </button>
                            <button
                                type="submit"
                                disabled={!value.trim()}
                                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {confirmText}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

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
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-surface border border-border-color rounded-3xl shadow-floating overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-300 ease-out">
                <div className="p-8 flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-primary/10 text-primary">
                            <Edit2 size={24} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <h3 className="text-xl font-bold text-text-primary tracking-tight">{title}</h3>
                            {message && <p className="text-sm text-text-secondary font-medium leading-tight">{message}</p>}
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <input
                            ref={inputRef}
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={placeholder}
                            className="w-full px-4 py-3.5 bg-black/5 dark:bg-white/5 border border-border-color rounded-2xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-medium"
                        />

                        <div className="flex gap-3 w-full">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="flex-1 px-4 py-3.5 text-sm font-bold text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl transition-all active:scale-95"
                            >
                                {cancelText}
                            </button>
                            <button
                                type="submit"
                                disabled={!value.trim()}
                                className="flex-1 px-4 py-3.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-2xl shadow-lg shadow-primary/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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

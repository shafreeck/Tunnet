"use client"

import { useTheme } from "next-themes"
import { Toaster } from "sonner"

export function ClientToaster() {
    const { theme = "system" } = useTheme()

    return (
        <Toaster
            theme={theme as "light" | "dark" | "system"}
            position="bottom-center"
            richColors
            closeButton
        />
    )
}

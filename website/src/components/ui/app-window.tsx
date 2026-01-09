"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export function AppWindow({ src }: { src: string }) {
    return (
        <div className="relative mx-auto max-w-5xl group">
            {/* Outer Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-emerald-500/20 blur-2xl rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            {/* Window Container */}
            <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0a0a0a]">
                {/* Window Title Bar */}
                <div className="h-10 bg-white/5 border-b border-white/10 flex items-center px-4 gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    </div>
                    <div className="flex-1 text-center text-[10px] text-slate-500 font-medium tracking-widest uppercase">
                        Tunnet - Global Network Proxy
                    </div>
                    <div className="w-12" /> {/* Spacer */}
                </div>

                {/* Screenshot Content */}
                <div className="relative aspect-[16/9] w-full">
                    <Image
                        src={src}
                        alt="Tunnet Application Interface"
                        fill
                        className="object-cover"
                        priority
                    />
                </div>
            </div>

            {/* Modern Reflection/Glare Effect */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/5 to-transparent opacity-30" />
        </div>
    );
}

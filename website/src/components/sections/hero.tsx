"use client";

import Image from "next/image";
import { motion } from "framer-motion";



export function Hero({ dict }: { dict: any }) {
    return (
        <section className="relative pt-32 pb-20 overflow-hidden min-h-screen flex flex-col justify-center">
            {/* Background Image with Overlay */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/hero-bg.png"
                    alt="Background"
                    fill
                    className="object-cover opacity-30"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/50 to-slate-950" />
            </div>

            <div className="container mx-auto px-4 z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
                        {dict.title[0]}<br />
                        <span className="text-gradient">{dict.title[1]}</span>
                    </h1>
                    <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-400 mb-10">
                        {dict.subtitle}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                        <a
                            href="#download"
                            className="px-8 py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-500/20 w-48"
                        >
                            {dict.start}
                        </a>
                        <a
                            href="https://github.com/shafreeck/Tunnet"
                            className="px-8 py-4 rounded-full glass hover:bg-white/10 text-white font-semibold transition-all w-48"
                        >
                            {dict.code}
                        </a>
                    </div>
                </motion.div>

                <motion.div
                    id="showcase"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, delay: 0.4 }}
                    className="relative max-w-5xl mx-auto scroll-mt-20"
                >
                    <div className="glass p-2 rounded-2xl shadow-2xl relative">
                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-emerald-500 opacity-20 blur-xl rounded-2xl" />
                        <Image
                            src="/mockup.png"
                            alt="Tunnet App Mockup"
                            width={1200}
                            height={800}
                            className="rounded-xl relative z-10"
                        />
                    </div>
                </motion.div>
            </div>
        </section>
    );
}

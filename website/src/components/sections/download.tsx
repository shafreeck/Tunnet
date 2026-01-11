"use client";

import { motion } from "framer-motion";
import { Apple, Monitor, Terminal } from "lucide-react";

const RELEASE_BASE_URL = "https://github.com/shafreeck/Tunnet/releases/download/v0.1.0";

const platforms = [
    {
        name: "macOS",
        icon: Apple,
        version: "v0.1.0",
        links: [
            { label: "Apple Silicon", url: `${RELEASE_BASE_URL}/Tunnet_0.1.0_aarch64.dmg` },
        ],
        description: "Apple Silicon",
    },
    {
        name: "Windows",
        icon: Monitor,
        version: "v0.1.0",
        links: [
            { label: "立即下载", url: `${RELEASE_BASE_URL}/Tunnet_0.1.0_x64-setup.exe` },
        ],
        description: "x64 & ARM64",
    },
    {
        name: "Linux",
        icon: Terminal,
        version: "v0.1.0",
        links: [
            { label: "AppImage", url: `${RELEASE_BASE_URL}/Tunnet_0.1.0_amd64.AppImage` },
            { label: "Deb", url: `${RELEASE_BASE_URL}/Tunnet_0.1.0_amd64.deb` },
        ],
        description: "AppImage & Deb",
    },
];

export function Download() {
    return (
        <section id="download" className="py-24 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/10 blur-[120px] rounded-full z-0" />

            <div className="container mx-auto px-4 relative z-10 text-center">
                <h2 className="text-3xl md:text-5xl font-bold mb-12">开启你的极速旅程</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {platforms.map((platform, index) => (
                        <motion.div
                            key={index}
                            whileHover={{ y: -10 }}
                            className="glass p-10 rounded-[2.5rem] flex flex-col items-center group"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                                <platform.icon className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">{platform.name}</h3>
                            <p className="text-blue-400 font-mono text-sm mb-4">{platform.version}</p>
                            <p className="text-slate-400 text-sm mb-8">{platform.description}</p>
                            <div className="w-full flex flex-col gap-3">
                                {platform.links.map((link, i) => (
                                    <a
                                        key={i}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 rounded-xl bg-white/10 hover:bg-white hover:text-black transition-all font-semibold block"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>

                <p className="mt-12 text-slate-500 text-sm">
                    通过下载即表示你同意我们的服务条款与隐私政策
                </p>
            </div>
        </section>
    );
}

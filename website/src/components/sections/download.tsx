"use client";

import { useState } from "react";

import { motion } from "framer-motion";
import { Apple, Monitor, Terminal } from "lucide-react";

const RELEASE_BASE_URL = "https://github.com/shafreeck/Tunnet/releases/download/v0.1.2";

const platformConfig = {
    macos: {
        icon: Apple,
        version: "v0.1.2",
        links: [
            { url: `${RELEASE_BASE_URL}/Tunnet_0.1.2_aarch64.dmg` },
        ],
    },
    windows: {
        icon: Monitor,
        version: "v0.1.2",
        links: [
            { url: `${RELEASE_BASE_URL}/Tunnet_0.1.2_x64_en-US.msi` },
        ],
    },
    linux: {
        icon: Terminal,
        version: "v0.1.2",
        links: [
            { url: `${RELEASE_BASE_URL}/Tunnet_0.1.2_amd64.deb` },
            { url: `${RELEASE_BASE_URL}/Tunnet_0.1.2_arm64.deb` },
        ],
    },
};

export function Download({ dict }: { dict: any }) {
    const [linuxArch, setLinuxArch] = useState<"x64" | "arm64">("x64");

    // Reconstruct platforms using dict data and static config
    const platforms = Object.keys(dict.platforms).map((key) => {
        const platformKey = key as keyof typeof platformConfig;
        const dictPlatform = dict.platforms[platformKey];
        const configPlatform = platformConfig[platformKey];

        let links = [];

        if (platformKey === 'linux') {
            // Special handling for Linux to support architecture toggle
            links = dictPlatform.links[linuxArch].map((link: { label: string, url: string }) => ({
                label: link.label,
                url: `${RELEASE_BASE_URL}/${link.url}`,
            }));
        } else {
            // Standard handling for macOS and Windows
            links = dictPlatform.links.map((link: { label: string }, index: number) => ({
                label: link.label,
                url: (configPlatform.links[index] as { url: string }).url,
            }));
        }

        return {
            id: key,
            name: dictPlatform.name,
            description: dictPlatform.desc,
            icon: configPlatform.icon,
            version: configPlatform.version,
            links: links,
        };
    });

    return (
        <section id="download" className="py-24 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/10 blur-[120px] rounded-full z-0" />

            <div className="container mx-auto px-4 relative z-10 text-center">
                <h2 className="text-3xl md:text-5xl font-bold mb-12">{dict.title}</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {platforms.map((platform, index) => (
                        <motion.div
                            key={index}
                            whileHover={{ y: -10 }}
                            className="glass p-10 rounded-[2.5rem] flex flex-col items-center group relative"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                                <platform.icon className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">{platform.name}</h3>
                            <p className="text-blue-400 font-mono text-sm mb-4">{platform.version}</p>

                            {/* Architecture Toggle for Linux */}
                            {platform.id === 'linux' ? (
                                <div className="mb-6 bg-white/5 p-1 rounded-lg flex items-center">
                                    <button
                                        onClick={() => setLinuxArch("x64")}
                                        className={`px-3 py-1 text-xs rounded-md transition-all ${linuxArch === "x64"
                                            ? "bg-blue-600 text-white shadow-lg"
                                            : "text-slate-400 hover:text-white"
                                            }`}
                                    >
                                        x64 / AMD64
                                    </button>
                                    <button
                                        onClick={() => setLinuxArch("arm64")}
                                        className={`px-3 py-1 text-xs rounded-md transition-all ${linuxArch === "arm64"
                                            ? "bg-blue-600 text-white shadow-lg"
                                            : "text-slate-400 hover:text-white"
                                            }`}
                                    >
                                        ARM64
                                    </button>
                                </div>
                            ) : (
                                <p className="text-slate-400 text-sm mb-8">{platform.description}</p>
                            )}

                            <div className={`w-full grid gap-3 ${platform.links.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {platform.links.map((link: { url: string; label: string }, i: number) => (
                                    <a
                                        key={i}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 px-2 rounded-xl bg-white/10 hover:bg-white hover:text-black transition-all font-semibold flex items-center justify-center text-sm text-center"
                                    >
                                        {link.label}
                                    </a>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>

                <p className="mt-12 text-slate-500 text-sm">
                    {dict.agreement}
                </p>
            </div>
        </section>
    );
}

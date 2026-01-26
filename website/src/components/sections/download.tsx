"use client";

import { useState } from "react";

import { motion } from "framer-motion";
import { Apple, Monitor, Terminal } from "lucide-react";
import { useGithubLatestRelease } from "@/hooks/use-github-release";

// Fallback configuration if API fails
const FALLBACK_VERSION = "0.2.2";
const FALLBACK_BASE_URL = `https://github.com/shafreeck/Tunnet/releases/download/v${FALLBACK_VERSION}`;

const platformConfig = {
    macos: {
        icon: Apple,
        // Match pattern for dynamic assets
        assetPattern: /aarch64\.dmg$/,
        fallbackLinks: [
            { url: `${FALLBACK_BASE_URL}/Tunnet_${FALLBACK_VERSION}_aarch64.dmg` },
        ],
    },
    windows: {
        icon: Monitor,
        assetPattern: /x64_en-US\.msi$/,
        fallbackLinks: [
            { url: `${FALLBACK_BASE_URL}/Tunnet_${FALLBACK_VERSION}_x64_en-US.msi` },
        ],
    },
    linux: {
        icon: Terminal,
        architectures: {
            x64: {
                patterns: [/amd64\.deb$/, /\.x86_64\.rpm$/],
                fallbackLinks: [
                    { url: `${FALLBACK_BASE_URL}/Tunnet_${FALLBACK_VERSION}_amd64.deb` },
                    { url: `${FALLBACK_BASE_URL}/Tunnet-${FALLBACK_VERSION}-1.x86_64.rpm` },
                ]
            },
            arm64: {
                patterns: [/arm64\.deb$/, /\.aarch64\.rpm$/],
                fallbackLinks: [
                    { url: `${FALLBACK_BASE_URL}/Tunnet_${FALLBACK_VERSION}_arm64.deb` },
                    { url: `${FALLBACK_BASE_URL}/Tunnet-${FALLBACK_VERSION}-1.aarch64.rpm` },
                ]
            }
        }
    },
};

export function Download({ dict }: { dict: any }) {
    const [linuxArch, setLinuxArch] = useState<"x64" | "arm64">("x64");
    const { release, loading } = useGithubLatestRelease();

    // Determine version to display
    const displayVersion = release ? release.tag_name : `v${FALLBACK_VERSION}`;

    // Reconstruct platforms using dict data and dynamic/static config
    const platforms = Object.keys(dict.platforms).map((key) => {
        const platformKey = key as keyof typeof platformConfig;
        const dictPlatform = dict.platforms[platformKey];
        const configPlatform = platformConfig[platformKey];

        let links: { label: string; url: string }[] = [];

        if (platformKey === 'linux') {
            // Special handling for Linux to support architecture toggle
            const archKey = linuxArch as "x64" | "arm64";
            const archConfig = (configPlatform as any).architectures[archKey];

            links = dictPlatform.links[archKey].map((link: { label: string }, index: number) => {
                let url = archConfig.fallbackLinks[index]?.url;

                // Try to find matching asset in release
                if (release && archConfig.patterns[index]) {
                    const asset = release.assets.find(a => archConfig.patterns[index].test(a.name));
                    if (asset) {
                        url = asset.browser_download_url;
                    }
                }

                return {
                    label: link.label,
                    url: url || "#",
                };
            });
        } else {
            // Standard handling for macOS and Windows
            links = dictPlatform.links.map((link: { label: string }, index: number) => {
                // Default to fallback
                let url = (configPlatform as any).fallbackLinks[index]?.url;

                // Try to find matching asset
                if (release && (configPlatform as any).assetPattern) {
                    // For macOS/Windows, we assume single link maps to the pattern
                    // or strictly index based. 
                    // Current logic: simple pattern match
                    const pattern = (configPlatform as any).assetPattern;
                    const asset = release.assets.find(a => pattern.test(a.name));
                    if (asset) {
                        url = asset.browser_download_url;
                    }
                }

                return {
                    label: link.label,
                    url: url || "#",
                };
            });
        }

        return {
            id: key,
            name: dictPlatform.name,
            description: dictPlatform.desc,
            icon: configPlatform.icon,
            version: displayVersion,
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
                            <p className="text-blue-400 font-mono text-sm mb-4">
                                {loading && !release ? <span className="animate-pulse">Loading...</span> : platform.version}
                            </p>

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

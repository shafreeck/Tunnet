"use client";

import { motion } from "framer-motion";
import { Zap, Shield, Globe, Layout, Cpu, Smartphone } from "lucide-react";

const features = [
    {
        title: "极致性能",
        description: "基于 sing-box 核心，提供极低延迟与超高吞吐量的网络转发体验。",
        icon: Zap,
        color: "text-amber-400",
    },
    {
        title: "安全隐私",
        description: "TUN 模式全流量接管，多重加密协议支持，守护你的网络边界。",
        icon: Shield,
        color: "text-blue-400",
    },
    {
        title: "直观节点视图",
        description: "通过地理位置直观展示全球节点分布，让复杂的网络拓扑一目了然。",
        icon: Globe,
        color: "text-emerald-400",
    },
    {
        title: "现代化 UI",
        description: "采用 Next.js 与 Shadcn UI 构建，极致丝滑的交互体验与视觉美感。",
        icon: Layout,
        color: "text-purple-400",
    },
    {
        title: "轻量架构",
        description: "Rust 与 Go 的完美结合，在保持高性能的同时，占用极低的系统资源。",
        icon: Cpu,
        color: "text-rose-400",
    },
    {
        title: "全平台兼容",
        description: "完美适配 macOS、Windows 与 Linux，提供一致的跨端使用体验。",
        icon: Smartphone,
        color: "text-cyan-400",
    },
];

export function Features() {
    return (
        <section id="features" className="py-24 bg-slate-950/50 relative">
            <div className="container mx-auto px-4">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">卓越特性，触手可及</h2>
                    <p className="text-slate-400 max-w-2xl mx-auto">
                        Tunnet 融合了前沿的技术栈与人性化的设计，旨在为你提供不仅仅是代理的连接体验。
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="glass p-8 rounded-3xl hover:bg-white/10 transition-all group"
                        >
                            <feature.icon className={`w-12 h-12 mb-6 ${feature.color} group-hover:scale-110 transition-transform`} />
                            <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                            <p className="text-slate-400 leading-relaxed">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

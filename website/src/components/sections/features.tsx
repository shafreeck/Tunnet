"use client";

import { motion } from "framer-motion";
import { Zap, Shield, Globe, Layout, Cpu, Smartphone } from "lucide-react";

const featureConfig = [
    { icon: Zap, color: "text-amber-400" },
    { icon: Shield, color: "text-blue-400" },
    { icon: Globe, color: "text-emerald-400" },
    { icon: Layout, color: "text-purple-400" },
    { icon: Cpu, color: "text-rose-400" },
    { icon: Smartphone, color: "text-cyan-400" },
];

export function Features({ dict }: { dict: any }) {
    const items = dict.items.map((item: any, index: number) => ({
        ...item,
        ...featureConfig[index],
    }));

    return (
        <section id="features" className="py-24 bg-slate-950/50 relative">
            <div className="container mx-auto px-4">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">{dict.section_title}</h2>
                    <p className="text-slate-400 max-w-2xl mx-auto">
                        {dict.section_desc}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {items.map((feature: any, index: number) => (
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

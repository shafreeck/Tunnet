"use client";

import Image from "next/image";

export function TrueMockup({ baseSrc, overlaySrc }: { baseSrc: string; overlaySrc: string }) {
    return (
        <div className="relative mx-auto max-w-5xl group select-none">
            {/* Glow effect behind the entire laptop */}
            <div className="absolute -inset-4 bg-blue-500/10 blur-[100px] rounded-full opacity-50" />

            {/* Base Hardware (Laptop/Desk/Coffee) */}
            <div className="relative z-10">
                <Image
                    src={baseSrc}
                    alt="Laptop Mockup Base"
                    width={1200}
                    height={800}
                    className="rounded-2xl shadow-2xl transition-transform duration-700 group-hover:scale-[1.01]"
                />

                {/* The Screen Overlay: Perspective Transform to match the laptop screen position */}
                {/* Coordinates estimated for the generated mockup-base.png */}
                <div
                    className="absolute z-20 overflow-hidden pointer-events-none"
                    style={{
                        top: "14.8%",
                        left: "8.6%",
                        width: "57.8%",
                        height: "53.2%",
                        perspective: "1200px",
                        // This transform is finely tuned to the perspective of our unbranded MacBook mockup
                        transform: "rotateY(-20.8deg) rotateX(2.2deg) rotateZ(-1.4deg) skewY(-0.6deg)",
                        transformStyle: "preserve-3d",
                        borderRadius: "4px",
                        boxShadow: "inset 0 0 20px rgba(0,0,0,0.3)", // Subtle depth
                    }}
                >
                    <div className="relative w-full h-full opacity-90 group-hover:opacity-100 transition-opacity duration-500">
                        <Image
                            src={overlaySrc}
                            alt="Real Tunnet UI"
                            fill
                            className="object-cover"
                            priority
                        />

                        {/* Glossy reflection overlay to match the environment */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent opacity-40 mix-blend-overlay" />
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
                    </div>
                </div>
            </div>
        </div>
    );
}

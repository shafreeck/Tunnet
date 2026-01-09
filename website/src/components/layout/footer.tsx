import Image from "next/image";

export function Footer() {
    return (
        <footer className="py-12 border-t border-white/5 bg-slate-950">
            <div className="container mx-auto px-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-3">
                        <Image src="/logo.png" alt="Tunnet Logo" width={32} height={32} />
                        <span className="text-xl font-bold tracking-tight">Tunnet</span>
                    </div>

                    <div className="text-slate-500 text-sm">
                        © {new Date().getFullYear()} Tunnet Team. 基于 MIT 协议开源。
                    </div>

                    <div className="flex gap-6">
                        <a href="https://github.com/shafreeck/Tunnet" className="text-slate-400 hover:text-white transition-colors">GitHub</a>
                        <a href="#" className="text-slate-400 hover:text-white transition-colors">文档</a>
                        <a href="#" className="text-slate-400 hover:text-white transition-colors">隐私政策</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}

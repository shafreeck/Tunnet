import Link from "next/link";
import Image from "next/image";

export function Navbar() {
    return (
        <nav className="fixed top-0 w-full z-50 glass border-b border-white/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center gap-2">
                        <Image src="/logo.png" alt="Tunnet Logo" width={32} height={32} />
                        <span className="text-xl font-bold tracking-tight">Tunnet</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
                        <Link href="#features" className="hover:text-white transition-colors">特性</Link>
                        <Link href="#showcase" className="hover:text-white transition-colors">预览</Link>
                        <Link href="#download" className="hover:text-white transition-colors">下载</Link>
                        <Link
                            href="https://github.com/shafreeck/Tunnet"
                            className="px-4 py-2 rounded-full bg-white text-black hover:bg-slate-200 transition-colors"
                        >
                            GitHub
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
}

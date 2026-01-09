import { Navbar } from "@/components/layout/navbar";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Download } from "@/components/sections/download";
import { Footer } from "@/components/layout/footer";

export default function Home() {
    return (
        <main className="min-h-screen">
            <Navbar />
            <Hero />
            <Features />
            <Download />
            <Footer />
        </main>
    );
}

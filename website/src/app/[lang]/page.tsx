import { Navbar } from "@/components/layout/navbar";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Download } from "@/components/sections/download";
import { Footer } from "@/components/layout/footer";
import { getDictionary } from "../../get-dictionary";
import { Locale } from "../../i18n-config";

export async function generateMetadata(props: { params: Promise<{ lang: Locale }> }) {
    const params = await props.params;
    const { lang } = params;
    const dict = await getDictionary(lang);

    return {
        title: dict.meta.title,
        description: dict.meta.description,
    };
}

export default async function Home(props: { params: Promise<{ lang: Locale }> }) {
    const params = await props.params;
    const { lang } = params;
    const dict = await getDictionary(lang);

    return (
        <main className="min-h-screen">
            <Navbar dict={dict.navbar} />
            <Hero dict={dict.hero} />
            <Features dict={dict.features} />
            <Download dict={dict.download} />
            <Footer dict={dict.footer} />
        </main>
    );
}

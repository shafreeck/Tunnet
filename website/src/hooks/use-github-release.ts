import { useState, useEffect } from 'react';

export interface GithubAsset {
    name: string;
    browser_download_url: string;
    content_type: string;
    size: number;
}

export interface GithubRelease {
    tag_name: string;
    name: string;
    html_url: string;
    assets: GithubAsset[];
    published_at: string;
}

export function useGithubLatestRelease() {
    const [release, setRelease] = useState<GithubRelease | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchRelease = async () => {
            try {
                const response = await fetch('https://api.github.com/repos/shafreeck/Tunnet/releases/latest');

                if (!response.ok) {
                    throw new Error(`GitHub API responded with status: ${response.status}`);
                }

                const data = await response.json();
                setRelease(data);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch latest release:', err);
                setError(err instanceof Error ? err : new Error('Unknown error'));
                setLoading(false);
            }
        };

        fetchRelease();
    }, []);

    return { release, loading, error };
}

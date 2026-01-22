import { getOctokit, context } from '@actions/github';
import { readFileSync, writeFileSync } from 'fs';

async function run() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error('GITHUB_TOKEN is required');
        process.exit(1);
    }

    const octokit = getOctokit(token);
    const { owner, repo } = context.repo;

    // Get the release
    const tagName = context.ref.replace('refs/tags/', '');
    console.log(`Fetching assets for release: ${tagName}`);

    const release = await octokit.rest.repos.getReleaseByTag({
        owner,
        repo,
        tag: tagName,
    });

    const assets = release.data.assets;
    console.log(`Found ${assets.length} assets`);

    const manifest = {
        version: tagName.replace(/^v/, ''),
        notes: release.data.body || `Release ${tagName}`,
        pub_date: release.data.published_at || new Date().toISOString(),
        platforms: {},
    };

    const platformsMapping = {
        'darwin-aarch64': ['aarch64.app.tar.gz', 'aarch64-apple-darwin.app.tar.gz', 'aarch64-apple-darwin.dmg'],
        'darwin-x86_64': ['x86_64.app.tar.gz', 'x86_64-apple-darwin.app.tar.gz', 'x86_64-apple-darwin.dmg'],
        'linux-x86_64': ['amd64.AppImage.tar.gz', 'amd64.AppImage', 'x86_64-unknown-linux-gnu.AppImage.tar.gz'],
        'linux-aarch64': ['aarch64.AppImage.tar.gz', 'aarch64.AppImage'],
        'windows-x86_64': ['x64-setup.exe.zip', 'x64-setup.exe', 'x64_en-US.msi.zip', 'x64_en-US.msi'],
    };

    for (const [platform, patterns] of Object.entries(platformsMapping)) {
        const asset = assets.find(a => patterns.some(p => a.name.endsWith(p) && !a.name.endsWith('.sig')));
        const sigAsset = assets.find(a => patterns.some(p => a.name.endsWith(p + '.sig')));

        if (asset && sigAsset) {
            console.log(`Found assets for ${platform}: ${asset.name}`);

            // We need to download the signature content or assume it's small enough to fetch via API?
            // Actually, downloading is better or just use the browser_download_url for the artifact
            // and we need the signature PLATE TEXT.

            // Let's fetch the signature content
            const sigResponse = await fetch(sigAsset.browser_download_url);
            const signature = await sigResponse.text();

            manifest.platforms[platform] = {
                signature: signature.trim(),
                url: asset.browser_download_url,
            };
        }
    }

    const manifestPath = 'latest.json';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Generated manifest: ${manifestPath}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

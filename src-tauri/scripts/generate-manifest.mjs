import { getOctokit, context } from '@actions/github';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

async function run() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error('GITHUB_TOKEN is required');
        process.exit(1);
    }

    const octokit = getOctokit(token);
    let owner, repo;
    if (process.env.GITHUB_REPOSITORY) {
        const parts = process.env.GITHUB_REPOSITORY.split('/');
        owner = parts[0];
        repo = parts[1];
    } else {
        // Fallback for local run
        owner = 'shafreeck';
        repo = 'Tunnet';
    }

    // Get the release
    let tagName;
    if (process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/')) {
        tagName = process.env.GITHUB_REF.replace('refs/tags/', '');
    } else {
        try {
            tagName = execSync('git describe --tags --abbrev=0').toString().trim();
        } catch (e) {
            console.error('Failed to determine tag name from git');
            process.exit(1);
        }
    }
    console.log(`Fetching assets for release: ${tagName} (repo: ${owner}/${repo})`);

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
        'linux-x86_64': ['amd64.AppImage.tar.gz', 'x86_64-unknown-linux-gnu.AppImage.tar.gz', 'amd64.AppImage'],
        'linux-x86_64-deb': ['amd64.deb', 'amd64.deb.zip'],
        'linux-x86_64-rpm': ['x86_64.rpm', 'x86_64.rpm.zip'],
        'linux-x86_64-appimage': ['amd64.AppImage.tar.gz', 'amd64.AppImage'],
        'linux-aarch64': ['aarch64.AppImage.tar.gz', 'arm64.AppImage.tar.gz', 'aarch64.AppImage', 'arm64.AppImage'],
        'windows-x86_64': ['x64-setup.exe.zip', 'x64-setup.exe', 'x64_en-US.msi.zip', 'x64_en-US.msi'],
        'windows-x86_64-msi': ['x64_en-US.msi.zip', 'x64_en-US.msi'],
        'windows-x86_64-nsis': ['x64-setup.exe.zip', 'x64-setup.exe'],
    };

    for (const [platform, patterns] of Object.entries(platformsMapping)) {
        let asset;

        // Iterate patterns to enforce priority
        for (const pattern of patterns) {
            asset = assets.find(a => a.name.endsWith(pattern) && !a.name.endsWith('.sig'));
            if (asset) {
                console.log(`Found asset for ${platform} using pattern '${pattern}': ${asset.name}`);
                break;
            }
        }

        if (asset) {
            // Find EXACT signature for this asset
            const sigAsset = assets.find(a => a.name === asset.name + '.sig');

            if (sigAsset) {
                console.log(`Found signature for ${asset.name}: ${sigAsset.name}`);

                // Let's fetch the signature content
                const sigResponse = await fetch(sigAsset.browser_download_url);
                const signature = await sigResponse.text();

                manifest.platforms[platform] = {
                    signature: signature.trim(),
                    url: asset.browser_download_url,
                };
            } else {
                console.warn(`No signature found for ${asset.name} (platform: ${platform})`);
            }
        } else {
            // Optional: Don't warn for every missing specific linux format if generic one exists, 
            // but here we want visibility.
            console.warn(`No matching asset found for ${platform}`);
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

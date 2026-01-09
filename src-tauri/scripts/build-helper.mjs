import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const srcTauriDir = join(rootDir, 'src-tauri');

const platform = process.platform;
const arch = process.arch;

if (platform === 'win32') {
    console.log('Skipping tunnet-helper build on Windows (not needed)');
    const resourcesDir = join(srcTauriDir, 'resources');
    if (!existsSync(resourcesDir)) {
        mkdirSync(resourcesDir, { recursive: true });
    }
    const placeholderPath = join(resourcesDir, 'tunnet-helper');
    if (!existsSync(placeholderPath)) {
        writeFileSync(placeholderPath, '');
    }
    process.exit(0);
}

let target = '';
let binaryName = 'tunnet-helper';

if (platform === 'darwin') {
    target = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
} else if (platform === 'win32') {
    target = arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
    binaryName += '.exe';
} else {
    target = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
}

const resourcesDir = join(srcTauriDir, 'resources');
const targetPath = join(resourcesDir, 'tunnet-helper');

// Function to get the latest modification time of a directory recursively
function getLatestMtime(dir) {
    let latest = 0;
    if (!existsSync(dir)) return 0;
    const files = readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = join(dir, file.name);
        if (file.isDirectory()) {
            if (file.name === 'target' || file.name === 'node_modules' || file.name === '.git') continue;
            latest = Math.max(latest, getLatestMtime(fullPath));
        } else {
            latest = Math.max(latest, statSync(fullPath).mtimeMs);
        }
    }
    return latest;
}

// Check if we need to rebuild
if (existsSync(targetPath)) {
    const binaryMtime = statSync(targetPath).mtimeMs;
    const srcMtime = getLatestMtime(join(srcTauriDir, 'src'));
    const cargoTomlMtime = statSync(join(srcTauriDir, 'Cargo.toml')).mtimeMs;
    const cargoLockPath = join(srcTauriDir, 'Cargo.lock');
    const cargoLockMtime = existsSync(cargoLockPath) ? statSync(cargoLockPath).mtimeMs : 0;

    const maxSrcMtime = Math.max(srcMtime, cargoTomlMtime, cargoLockMtime);

    if (binaryMtime > maxSrcMtime) {
        console.log('tunnet-helper is up to date, skipping build.');
        process.exit(0);
    }
}

console.log(`Building ${binaryName} for ${target}...`);

// Ensure resources directory exists
if (!existsSync(resourcesDir)) {
    mkdirSync(resourcesDir, { recursive: true });
}

// Create a placeholder file to satisfy tauri_build check
const placeholderPath = join(resourcesDir, 'tunnet-helper');
if (!existsSync(placeholderPath)) {
    writeFileSync(placeholderPath, '');
}

// Build the helper binary
const cargoArgs = ['build', '--bin', 'tunnet-helper', '--release', '--target', target];
const buildResult = spawnSync('cargo', cargoArgs, {
    cwd: srcTauriDir,
    stdio: 'inherit',
    shell: platform === 'win32'
});

if (buildResult.status !== 0) {
    console.error('Cargo build failed');
    process.exit(1);
}

// Copy the binary to resources/tunnet-helper
const builtBinaryPath = join(srcTauriDir, 'target', target, 'release', binaryName);
copyFileSync(builtBinaryPath, targetPath);

if (platform !== 'win32') {
    chmodSync(targetPath, 0o755);
}

// Copy the app icon to public/logo.png for README and other uses
const iconSrc = join(srcTauriDir, 'icons', 'icon.png');
const iconDest = join(rootDir, 'public', 'logo.png');
if (existsSync(iconSrc)) {
    copyFileSync(iconSrc, iconDest);
    console.log(`Copied icon to ${iconDest}`);
}

console.log(`Successfully built and copied ${binaryName} to ${targetPath}`);

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const srcTauriDir = join(rootDir, 'src-tauri');

const platform = process.platform;
const arch = process.arch;

if (platform === 'win32') {
    console.log('Skipping tunnet-helper build on Windows (not needed)');
    const srcTauriDir = join(rootDir, 'src-tauri');
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

console.log(`Building ${binaryName} for ${target}...`);

// Ensure resources directory exists
const resourcesDir = join(srcTauriDir, 'resources');
if (!existsSync(resourcesDir)) {
    mkdirSync(resourcesDir, { recursive: true });
}

// Create a placeholder file to satisfy tauri_build check (chicken-and-egg problem)
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
// Note: The installer expects the binary name to be 'tunnet-helper'
const builtBinaryPath = join(srcTauriDir, 'target', target, 'release', binaryName);
const targetPath = join(resourcesDir, 'tunnet-helper');

copyFileSync(builtBinaryPath, targetPath);

if (platform !== 'win32') {
    chmodSync(targetPath, 0o755);
}

console.log(`Successfully built and copied ${binaryName} to ${targetPath}`);

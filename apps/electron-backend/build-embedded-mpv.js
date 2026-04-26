const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    copyRuntimeToNativeBuild,
    findLibMpv,
    patchAddonForBundledRuntime,
    validateNoForbiddenRuntimeLinks,
} = require('../../tools/packaging/embedded-mpv-macos.cjs');

const workspaceRoot = process.cwd();
const addonRoot = path.join(workspaceRoot, 'apps', 'electron-backend', 'native');
const outputDir = path.join(addonRoot, 'build', 'Release');
const outputFile = path.join(outputDir, 'embedded_mpv.node');
const outputLibDir = path.join(outputDir, 'lib');
const unavailableMarkerFile = path.join(outputDir, 'embedded-mpv-unavailable.txt');
const homebrewIncludeDir = '/opt/homebrew/include';
const homebrewLibDir = '/opt/homebrew/lib';
const targetArch =
    process.env.IPTVNATOR_EMBEDDED_MPV_ARCH ||
    process.env.npm_config_arch ||
    process.arch;
const vendoredRuntimeRoot = path.join(
    workspaceRoot,
    'vendor',
    'embedded-mpv',
    `darwin-${targetArch}`
);
const vendoredIncludeDir = path.join(vendoredRuntimeRoot, 'include');
const vendoredLibDir = path.join(vendoredRuntimeRoot, 'lib');
const homebrewFallbackEnabled =
    process.env.IPTVNATOR_EMBEDDED_MPV_ALLOW_HOMEBREW === '1';

function log(message) {
    process.stdout.write(`[embedded-mpv] ${message}\n`);
}

function cleanOutput() {
    fs.rmSync(outputFile, { force: true });
    fs.rmSync(outputLibDir, { recursive: true, force: true });
    fs.rmSync(path.join(outputDir, 'embedded-mpv-runtime.json'), {
        force: true,
    });
    fs.writeFileSync(
        unavailableMarkerFile,
        'Embedded MPV native runtime is not available for this build.\n'
    );
}

function readRuntimeManifest(runtimeRoot) {
    const manifestPath = path.join(runtimeRoot, 'runtime-manifest.json');
    if (!fs.existsSync(manifestPath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function resolveRuntime() {
    const vendoredLibMpv = findLibMpv(vendoredLibDir);
    const vendoredHeader = path.join(vendoredIncludeDir, 'mpv', 'client.h');

    if (vendoredLibMpv && fs.existsSync(vendoredHeader)) {
        return {
            origin: 'vendored-lgpl',
            includeDir: vendoredIncludeDir,
            libDir: vendoredLibDir,
            manifest: readRuntimeManifest(vendoredRuntimeRoot),
        };
    }

    if (homebrewFallbackEnabled) {
        const homebrewLibMpv = findLibMpv(homebrewLibDir);
        const homebrewHeader = path.join(homebrewIncludeDir, 'mpv', 'client.h');
        if (homebrewLibMpv && fs.existsSync(homebrewHeader)) {
            log(
                'Using Homebrew libmpv as a development-only fallback. Release packaging will reject this runtime.'
            );
            return {
                origin: 'homebrew-dev',
                includeDir: homebrewIncludeDir,
                libDir: homebrewLibDir,
                manifest: {
                    warning:
                        'Development-only runtime. Do not ship this in release artifacts.',
                },
            };
        }
    }

    return null;
}

function resolveElectronNodeGypBin() {
    const pnpmRoot = path.join(workspaceRoot, 'node_modules', '.pnpm');

    if (!fs.existsSync(pnpmRoot)) {
        throw new Error('Unable to find node_modules/.pnpm.');
    }

    const packageDirs = fs
        .readdirSync(pnpmRoot, { withFileTypes: true })
        .filter(
            (entry) =>
                entry.isDirectory() &&
                entry.name.startsWith('@electron+node-gyp@')
        )
        .map((entry) => entry.name)
        .sort();

    for (const packageDir of packageDirs) {
        const candidate = path.join(
            pnpmRoot,
            packageDir,
            'node_modules',
            '@electron',
            'node-gyp',
            'bin',
            'node-gyp.js'
        );

        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error('Unable to resolve @electron/node-gyp.');
}

function runNodeGyp(command, env) {
    const nodeGypBin = resolveElectronNodeGypBin();
    const result = spawnSync(
        process.execPath,
        [nodeGypBin, command, '--directory', addonRoot],
        {
            cwd: workspaceRoot,
            env,
            stdio: 'inherit',
        }
    );

    if (result.status !== 0) {
        throw new Error(`node-gyp ${command} failed with status ${result.status ?? 1}.`);
    }
}

function main() {
    fs.mkdirSync(outputDir, { recursive: true });

    if (process.platform !== 'darwin') {
        cleanOutput();
        log('Skipping build on non-macOS host.');
        return;
    }

    const runtime = resolveRuntime();
    if (!runtime) {
        cleanOutput();
        log(
            [
                `Skipping build because no embedded MPV runtime was found for darwin-${targetArch}.`,
                `Expected vendored runtime at ${vendoredRuntimeRoot}.`,
                'For local development only, set IPTVNATOR_EMBEDDED_MPV_ALLOW_HOMEBREW=1 to use Homebrew libmpv.',
            ].join('\n')
        );
        return;
    }

    const runtimeManifest = copyRuntimeToNativeBuild({
        runtimeLibDir: runtime.libDir,
        outputLibDir,
        runtimeOrigin: runtime.origin,
        runtimeManifest: {
            targetArch,
            ...runtime.manifest,
        },
    });
    fs.rmSync(unavailableMarkerFile, { force: true });

    const electronPackageJson = require(path.join(
        workspaceRoot,
        'node_modules',
        'electron',
        'package.json'
    ));
    const electronVersion = electronPackageJson.version;
    const env = {
        ...process.env,
        npm_config_runtime: 'electron',
        npm_config_target: electronVersion,
        npm_config_arch: targetArch,
        npm_config_disturl: 'https://electronjs.org/headers',
        npm_config_build_from_source: 'true',
        npm_config_update_binary: 'false',
        LIBMPV_INCLUDE_DIR: runtime.includeDir,
        LIBMPV_LIBRARY_DIR: outputLibDir,
    };

    log(
        `Building native addon against Electron ${electronVersion} using ${runtime.origin} runtime for darwin-${targetArch}...`
    );
    runNodeGyp('configure', env);
    runNodeGyp('build', env);

    if (!fs.existsSync(outputFile)) {
        throw new Error(`Build finished without producing ${outputFile}.`);
    }

    patchAddonForBundledRuntime(outputFile, outputLibDir);
    const forbiddenLinkErrors = validateNoForbiddenRuntimeLinks([
        outputFile,
        ...runtimeManifest.dylibs.map((dylib) => path.join(outputLibDir, dylib)),
    ]);
    if (runtime.origin === 'vendored-lgpl' && forbiddenLinkErrors.length > 0) {
        throw new Error(forbiddenLinkErrors.join('\n'));
    }

    log(`Built ${path.relative(workspaceRoot, outputFile)}.`);
}

try {
    main();
} catch (error) {
    process.stderr.write(
        `[embedded-mpv] ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
}

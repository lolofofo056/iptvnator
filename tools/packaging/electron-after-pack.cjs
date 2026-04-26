const linuxAfterPack = require('./linux-after-pack.cjs');
const {
    validatePackagedEmbeddedMpv,
} = require('./embedded-mpv-macos.cjs');
const fs = require('fs');
const path = require('path');

function log(message) {
    console.log(`  - ${message}`);
}

function isTruthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(
        String(value ?? '')
            .trim()
            .toLowerCase()
    );
}

async function afterPackHook(params) {
    await linuxAfterPack(params);

    if (params.electronPlatformName !== 'darwin') {
        return;
    }

    const requireEmbeddedMpv = isTruthy(
        process.env.IPTVNATOR_REQUIRE_EMBEDDED_MPV
    );
    log(
        requireEmbeddedMpv
            ? 'validating required embedded MPV macOS runtime links'
            : 'validating optional embedded MPV macOS runtime links'
    );
    const appPath = params.appOutDir.endsWith('.app')
        ? params.appOutDir
        : fs
              .readdirSync(params.appOutDir)
              .find((entry) => entry.endsWith('.app'));
    const resourceDir = appPath
        ? path.join(
              params.appOutDir.endsWith('.app')
                  ? params.appOutDir
                  : path.join(params.appOutDir, appPath),
              'Contents',
              'Resources'
          )
        : params.appOutDir;
    const errors = validatePackagedEmbeddedMpv(resourceDir, {
        required: requireEmbeddedMpv,
    });

    if (errors.length > 0) {
        throw new Error(
            [
                'Embedded MPV macOS package validation failed.',
                ...errors.map((error) => `- ${error}`),
            ].join('\n')
        );
    }

    log('embedded MPV macOS runtime links validated');
}

module.exports = afterPackHook;

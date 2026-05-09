import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const electronBuilderConfig = JSON.parse(
    fs.readFileSync(
        join(currentDir, '..', '..', 'electron-builder.json'),
        'utf8'
    )
);

test('Linux package identity does not expose the internal Electron backend project name', () => {
    assert.equal(electronBuilderConfig.productName, 'IPTVnator');
    assert.equal(electronBuilderConfig.extraMetadata?.name, 'iptvnator');
    assert.equal(electronBuilderConfig.extraMetadata?.productName, 'IPTVnator');
    assert.equal(electronBuilderConfig.linux?.executableName, 'iptvnator');
    assert.equal(
        electronBuilderConfig.linux?.desktop?.entry?.StartupWMClass,
        'iptvnator'
    );
});

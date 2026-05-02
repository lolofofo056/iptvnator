#!/usr/bin/env node
/**
 * Mechanical i18n merger.
 *
 * Modes:
 *   node tools/i18n/fill-missing.mjs --emit-missing   Dump tools/i18n/missing/<lang>.json
 *                                                    listing every missing key with the EN value.
 *   node tools/i18n/fill-missing.mjs                  Merge tools/i18n/patches/<lang>.json into
 *                                                    apps/web/src/assets/i18n/<lang>.json,
 *                                                    preserving existing translations and the
 *                                                    key order from en.json.
 *
 * The script never invents translations. If a key is missing from both the locale file
 * and the patch file, it is left absent and the script exits non-zero.
 */
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const I18N_DIR = resolve(REPO_ROOT, 'apps/web/src/assets/i18n');
const PATCH_DIR = resolve(__dirname, 'patches');
const MISSING_DIR = resolve(__dirname, 'missing');

const args = new Set(process.argv.slice(2));
const EMIT_MISSING = args.has('--emit-missing');

function readJSON(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, obj) {
    writeFileSync(path, JSON.stringify(obj, null, 4) + '\n');
}

function collectLeaves(obj, prefix = '') {
    const leaves = [];
    for (const [key, val] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            leaves.push(...collectLeaves(val, path));
        } else {
            leaves.push(path);
        }
    }
    return leaves;
}

function getByPath(obj, path) {
    return path
        .split('.')
        .reduce((cur, k) => (cur == null ? cur : cur[k]), obj);
}

/**
 * Build a new object whose shape mirrors `template` (key order + nesting),
 * pulling values from `existing` first, then `patch`. Keys absent from both
 * are pushed to the `missing` array and skipped.
 */
function mergeOrdered(template, existing, patch, missing, prefix = '') {
    const out = {};
    for (const [key, val] of Object.entries(template)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const merged = mergeOrdered(val, existing, patch, missing, path);
            if (Object.keys(merged).length > 0) out[key] = merged;
        } else {
            const fromExisting = getByPath(existing, path);
            if (typeof fromExisting === 'string') {
                out[key] = fromExisting;
            } else if (Object.prototype.hasOwnProperty.call(patch, path)) {
                out[key] = patch[path];
            } else {
                missing.push(path);
            }
        }
    }
    return out;
}

function listLocaleFiles() {
    return readdirSync(I18N_DIR)
        .filter((f) => f.endsWith('.json') && f !== 'en.json')
        .sort();
}

function emitMissing(en, enKeys) {
    if (!existsSync(MISSING_DIR)) mkdirSync(MISSING_DIR, { recursive: true });
    for (const file of listLocaleFiles()) {
        const lang = file.replace(/\.json$/, '');
        const localePath = resolve(I18N_DIR, file);
        const localeData = readJSON(localePath);
        const localeKeys = new Set(collectLeaves(localeData));
        const missing = enKeys.filter((k) => !localeKeys.has(k));
        const dump = {};
        for (const k of missing) dump[k] = getByPath(en, k);
        writeJSON(resolve(MISSING_DIR, `${lang}.json`), dump);
        console.log(`emit  ${file.padEnd(10)} missing=${missing.length}`);
    }
}

function mergeAll(en) {
    let failed = false;
    for (const file of listLocaleFiles()) {
        const lang = file.replace(/\.json$/, '');
        const localePath = resolve(I18N_DIR, file);
        const patchPath = resolve(PATCH_DIR, `${lang}.json`);
        const localeData = readJSON(localePath);
        const patch = existsSync(patchPath) ? readJSON(patchPath) : {};

        const stillMissing = [];
        const merged = mergeOrdered(en, localeData, patch, stillMissing);
        writeJSON(localePath, merged);

        if (stillMissing.length > 0) {
            failed = true;
            console.log(
                `FAIL  ${file.padEnd(10)} still missing ${stillMissing.length} keys: ${stillMissing
                    .slice(0, 3)
                    .join(', ')}${stillMissing.length > 3 ? '…' : ''}`
            );
        } else {
            console.log(`ok    ${file.padEnd(10)} fully merged`);
        }
    }
    if (failed) process.exit(1);
}

const en = readJSON(resolve(I18N_DIR, 'en.json'));
const enKeys = collectLeaves(en);
console.log(`en.json: ${enKeys.length} leaf keys`);

if (EMIT_MISSING) emitMissing(en, enKeys);
else mergeAll(en);

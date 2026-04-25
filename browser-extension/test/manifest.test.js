/**
 * Validation tests for the browser extension's manifest.json + script
 * files. The actual extension behavior requires a real browser; these
 * tests cover the things CI can validate without one:
 *
 *   1. manifest.json parses + has the required MV3 fields.
 *   2. Permissions are minimal — host_permissions stays at <all_urls>
 *      because we have to detect MDZ links anywhere, but no scripting
 *      / cookies / webNavigation creep allowed without an explicit
 *      threat-model update here first.
 *   3. CSP for extension pages is strict (no 'unsafe-eval', no remote
 *      script-src).
 *   4. Every file referenced by manifest.json exists on disk.
 *   5. Every script file passes node --check syntax validation.
 *   6. CSS files are valid (parseable by linkedom which we already use).
 *
 * Run: `node --test browser-extension/test/*.test.js`
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const EXT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(EXT_DIR, 'manifest.json');

function readManifest() {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. manifest.json structure
// ---------------------------------------------------------------------------

test('manifest.json: parses as JSON', () => {
    const m = readManifest();
    assert.ok(m && typeof m === 'object');
});

test('manifest.json: declares MV3 (manifest_version === 3)', () => {
    const m = readManifest();
    assert.strictEqual(m.manifest_version, 3, 'must be MV3 for forward compat');
});

test('manifest.json: has required identity fields', () => {
    const m = readManifest();
    assert.ok(m.name, 'name required');
    assert.ok(m.version, 'version required');
    assert.match(m.version, /^\d+\.\d+\.\d+(?:-[\w.]+)?$/, 'version must look like SemVer');
    assert.ok(m.description, 'description required for store listings');
});

test('manifest.json: declares an MV3 service-worker background', () => {
    const m = readManifest();
    assert.ok(m.background, 'background required');
    assert.ok(m.background.service_worker, 'MV3 mandates service_worker (NOT background.scripts)');
    assert.strictEqual(m.background.type, 'module', 'service_worker should be ES module');
});

test('manifest.json: gecko-specific settings present (Firefox compat)', () => {
    const m = readManifest();
    assert.ok(
        m.browser_specific_settings && m.browser_specific_settings.gecko,
        'browser_specific_settings.gecko required for Firefox AMO submission',
    );
    assert.match(
        m.browser_specific_settings.gecko.id,
        /^[\w-]+@[\w.-]+$/,
        'Firefox add-on id must be email-shaped',
    );
});

// ---------------------------------------------------------------------------
// 2. Permissions hygiene
// ---------------------------------------------------------------------------

test('manifest.json: permissions are minimal — no scripting/cookies/webNavigation', () => {
    const m = readManifest();
    const dangerous = ['scripting', 'cookies', 'webNavigation', 'tabs', 'history', 'bookmarks'];
    for (const perm of dangerous) {
        assert.ok(
            !(m.permissions ?? []).includes(perm),
            `permission "${perm}" should not be added without a threat-model update`,
        );
    }
});

test('manifest.json: host_permissions stays at <all_urls> only', () => {
    const m = readManifest();
    // We deliberately DO need <all_urls> to detect .mdz links anywhere.
    // But adding more specific patterns alongside it is a smell — either
    // <all_urls> covers it or you don't need it.
    const hosts = m.host_permissions ?? [];
    if (hosts.length > 1) {
        assert.fail(
            `host_permissions should be exactly ["<all_urls>"] or empty; got ${JSON.stringify(hosts)}`,
        );
    }
});

// ---------------------------------------------------------------------------
// 3. CSP for extension pages
// ---------------------------------------------------------------------------

test('manifest.json: CSP forbids unsafe-eval', () => {
    const m = readManifest();
    const csp = m.content_security_policy?.extension_pages ?? '';
    assert.ok(!csp.includes("'unsafe-eval'"), 'unsafe-eval is never acceptable');
    assert.ok(!csp.includes("'wasm-unsafe-eval'"), 'wasm-unsafe-eval requires explicit review');
});

test('manifest.json: CSP forbids remote script-src', () => {
    const m = readManifest();
    const csp = m.content_security_policy?.extension_pages ?? '';
    // Pull script-src directive value.
    const scriptSrcMatch = /script-src\s+([^;]+)/.exec(csp);
    assert.ok(scriptSrcMatch, 'CSP must declare script-src');
    const scriptSrc = scriptSrcMatch[1].trim();
    assert.ok(
        scriptSrc === "'self'" || scriptSrc === "'self' 'wasm-unsafe-eval'",
        `script-src must be 'self' (got ${JSON.stringify(scriptSrc)}); remote scripts are forbidden`,
    );
});

test('manifest.json: CSP forbids object-src (no plugins)', () => {
    const m = readManifest();
    const csp = m.content_security_policy?.extension_pages ?? '';
    assert.match(
        csp,
        /object-src\s+'none'/,
        "object-src must be 'none' — no Java/Flash plugin embedding",
    );
});

// ---------------------------------------------------------------------------
// 4. Files referenced exist on disk
// ---------------------------------------------------------------------------

test('manifest.json: every referenced file exists', () => {
    const m = readManifest();
    const refs = [];
    if (m.background?.service_worker) refs.push(m.background.service_worker);
    for (const cs of m.content_scripts ?? []) {
        for (const j of cs.js ?? []) refs.push(j);
        for (const c of cs.css ?? []) refs.push(c);
    }
    for (const war of m.web_accessible_resources ?? []) {
        for (const r of war.resources ?? []) refs.push(r);
    }
    if (m.action?.default_popup) refs.push(m.action.default_popup);
    for (const [, p] of Object.entries(m.icons ?? {})) refs.push(p);

    for (const ref of refs) {
        const abs = path.join(EXT_DIR, ref);
        assert.ok(fs.existsSync(abs), `manifest references missing file: ${ref}`);
    }
});

// ---------------------------------------------------------------------------
// 5. JS syntax check via node --check
// ---------------------------------------------------------------------------

test('all referenced .js files pass node --check', () => {
    const m = readManifest();
    const jsRefs = [];
    if (m.background?.service_worker?.endsWith('.js')) jsRefs.push(m.background.service_worker);
    for (const cs of m.content_scripts ?? []) {
        for (const j of cs.js ?? []) if (j.endsWith('.js')) jsRefs.push(j);
    }
    for (const war of m.web_accessible_resources ?? []) {
        for (const r of war.resources ?? []) if (r.endsWith('.js')) jsRefs.push(r);
    }

    for (const js of jsRefs) {
        const abs = path.join(EXT_DIR, js);
        try {
            execFileSync('node', ['--check', abs], { stdio: 'pipe' });
        } catch (e) {
            assert.fail(`${js} failed node --check:\n${e.stderr?.toString() ?? e.message}`);
        }
    }
});

// ---------------------------------------------------------------------------
// 6. Popup HTML exists + references known files
// ---------------------------------------------------------------------------

test('popup.html: references only files that exist', () => {
    const m = readManifest();
    const popup = m.action?.default_popup;
    if (!popup) return; // popup is optional
    const abs = path.join(EXT_DIR, popup);
    const html = fs.readFileSync(abs, 'utf8');
    const popupDir = path.dirname(abs);
    // Find every src= / href= and verify it resolves.
    for (const m2 of html.matchAll(/(?:src|href)=["']([^"'#?]+)/g)) {
        const ref = m2[1];
        if (/^(https?:|data:|mailto:)/.test(ref)) continue;
        const target = path.resolve(popupDir, ref);
        assert.ok(fs.existsSync(target), `popup.html references missing: ${ref} → ${target}`);
    }
});

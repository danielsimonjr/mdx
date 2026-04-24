/**
 * Unit tests for VS Code extension helpers.
 *
 * Covers buildPreviewHtml / escapeHtml / PREVIEW_MAX_BYTES — the pure
 * bits extracted from extension.js so they don't require the vscode
 * module. Run with `node --test integrations/vscode/test/*.test.js`.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
    buildPreviewHtml,
    escapeHtml,
    PREVIEW_MAX_BYTES,
} = require('../src/helpers.js');

test('escapeHtml escapes the five critical characters', () => {
    assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
    assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
    assert.strictEqual(escapeHtml(`"'`), '&quot;&#039;');
});

test('escapeHtml coerces non-strings', () => {
    assert.strictEqual(escapeHtml(42), '42');
    assert.strictEqual(escapeHtml(null), 'null');
});

test('buildPreviewHtml wraps short markdown unchanged', () => {
    const html = buildPreviewHtml('# Title\n\nHello.', 'light');
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /# Title/);
    // Banner always present; no truncation banner on short content.
    assert.match(html, /MDZ preview is a raw-Markdown view/);
    assert.doesNotMatch(html, /Preview truncated/);
});

test('buildPreviewHtml injects the theme attribute safely', () => {
    const html = buildPreviewHtml('body', 'dark');
    assert.match(html, /data-theme="dark"/);
});

test('buildPreviewHtml escapes theme attribute against injection', () => {
    const html = buildPreviewHtml('body', 'dark"><script>alert(1)</script>');
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&quot;&gt;&lt;script&gt;/);
});

test('buildPreviewHtml truncates oversized markdown and adds banner', () => {
    const big = 'x'.repeat(PREVIEW_MAX_BYTES + 100);
    const html = buildPreviewHtml(big, 'auto');
    assert.match(html, /Preview truncated/);
    // The <pre> body cannot be longer than PREVIEW_MAX_BYTES worth of chars.
    const preMatch = html.match(/<pre>([\s\S]*?)<\/pre>/);
    assert.ok(preMatch, 'pre block present');
    assert.ok(
        preMatch[1].length <= PREVIEW_MAX_BYTES + 500,
        `pre length ${preMatch[1].length} should stay near PREVIEW_MAX_BYTES`,
    );
});

test('buildPreviewHtml does not execute raw markdown as HTML', () => {
    const html = buildPreviewHtml('<img src=x onerror=alert(1)>', 'light');
    assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('PREVIEW_MAX_BYTES is 1 MB', () => {
    assert.strictEqual(PREVIEW_MAX_BYTES, 1_000_000);
});

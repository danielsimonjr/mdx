/**
 * Unit tests for runCliCore — the testable core of the VS Code
 * extension's CLI-invocation logic. Fakes the execFn, OUTPUT channel,
 * and notification surface so we can assert:
 *
 *   1. execFn receives an argv array (never a shell string).
 *   2. Concurrent invocations with the same key short-circuit.
 *   3. inFlight entries are cleaned up on completion.
 *   4. Missing filePath surfaces a warning and does NOT spawn.
 *   5. Non-zero exit surfaces an error notification.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { runCliCore } = require('../src/helpers.js');

function mkFakes() {
    const calls = [];
    const warnings = [];
    const errors = [];
    const outLines = [];
    const handles = [];

    const execFn = (file, args, opts, callback) => {
        const handle = { file, args, opts, callback, id: handles.length };
        calls.push({ file, args, opts });
        handles.push(handle);
        return handle;
    };
    const out = {
        show: () => {},
        appendLine: (s) => outLines.push(s),
        append: (s) => outLines.push(s),
    };
    return {
        deps: {
            execFn,
            showWarning: (m) => warnings.push(m),
            showError: (m) => errors.push(m),
            out,
            inFlight: new Map(),
        },
        calls,
        warnings,
        errors,
        outLines,
        handles,
    };
}

test('runCliCore: missing filePath shows warning, does not spawn', () => {
    const fakes = mkFakes();
    const result = runCliCore(fakes.deps, 'mdz', 'validate', null);
    assert.strictEqual(result, null);
    assert.strictEqual(fakes.calls.length, 0);
    assert.strictEqual(fakes.warnings.length, 1);
    assert.match(fakes.warnings[0], /needs a file/);
});

test('runCliCore: spawns with argv array, never a shell string', () => {
    const fakes = mkFakes();
    // Path with shell metacharacters that would be catastrophic in a
    // shell string. argv-mode must pass them verbatim to execFile.
    const evilPath = '/tmp/a; rm -rf $HOME && cat /etc/passwd || echo "owned"';
    runCliCore(fakes.deps, 'mdz', 'validate', evilPath);
    assert.strictEqual(fakes.calls.length, 1);
    assert.strictEqual(fakes.calls[0].file, 'mdz');
    assert.deepStrictEqual(fakes.calls[0].args, ['validate', evilPath]);
    assert.strictEqual(fakes.calls[0].opts.shell, false);
});

test('runCliCore: execFn opts include shell:false', () => {
    const fakes = mkFakes();
    runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    assert.strictEqual(fakes.calls[0].opts.shell, false);
});

test('runCliCore: concurrent invocation short-circuits', () => {
    const fakes = mkFakes();
    runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    const result = runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    assert.strictEqual(result, null);
    assert.strictEqual(fakes.calls.length, 1);
    assert.strictEqual(fakes.warnings.length, 1);
    assert.match(fakes.warnings[0], /already running/);
});

test('runCliCore: different subcommands on same file run in parallel', () => {
    const fakes = mkFakes();
    runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    runCliCore(fakes.deps, 'mdz', 'verify', '/tmp/a.mdz');
    assert.strictEqual(fakes.calls.length, 2);
    assert.strictEqual(fakes.warnings.length, 0);
});

test('runCliCore: completion clears inFlight entry', () => {
    const fakes = mkFakes();
    runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    assert.strictEqual(fakes.deps.inFlight.size, 1);
    // Invoke the completion callback as child_process would.
    fakes.handles[0].callback(null, 'ok-stdout', '');
    assert.strictEqual(fakes.deps.inFlight.size, 0);
});

test('runCliCore: non-zero exit surfaces error notification', () => {
    const fakes = mkFakes();
    runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    fakes.handles[0].callback({ code: 2, message: 'bad' }, '', 'bad-stderr');
    assert.strictEqual(fakes.errors.length, 1);
    assert.match(fakes.errors[0], /failed \(2\)/);
});

test('runCliCore: err.code undefined falls back to err.message', () => {
    const fakes = mkFakes();
    runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    // Simulate ENOENT where err.code is sometimes a string, sometimes undefined.
    fakes.handles[0].callback({ code: undefined, message: 'spawn mdz ENOENT' }, '', '');
    assert.strictEqual(fakes.errors.length, 1);
    assert.match(fakes.errors[0], /ENOENT/);
});

test('runCliCore: second call after completion succeeds', () => {
    const fakes = mkFakes();
    runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    fakes.handles[0].callback(null, '', '');
    const result = runCliCore(fakes.deps, 'mdz', 'validate', '/tmp/a.mdz');
    assert.notStrictEqual(result, null);
    assert.strictEqual(fakes.calls.length, 2);
});

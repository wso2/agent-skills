"use strict";

// Subprocess layer for the `bal` CLI.
//
// Wraps node's child_process.execFile with:
//   - per-call timeout (default 60s)
//   - honours caller AbortSignal — re-throws CancelledError if it fires
//   - maps ENOENT → BalNotInstalledError
//   - maps non-zero exit → BalCommandError with captured stderr
//   - sets COLUMNS=200 so `bal search` doesn't truncate names
//
// No retries. A local command that fails once will fail again.

const { execFile: nodeExecFile } = require("node:child_process");
const {
    BalNotInstalledError,
    BalCommandError,
    TimeoutError,
    CancelledError,
} = require("./errors.js");

const DEFAULTS = Object.freeze({
    timeoutMs: 60_000,
});

/**
 * runBal — spawn the `bal` CLI with the given arguments.
 *
 * @param {string[]} args  e.g. ["search", "gmail"]
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.execFile]  — override for tests; defaults to child_process.execFile
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws BalNotInstalledError | BalCommandError | TimeoutError | CancelledError
 */
function runBal(args, opts = {}) {
    const execFile = opts.execFile || nodeExecFile;
    const {
        signal: parentSignal,
        timeoutMs = DEFAULTS.timeoutMs,
    } = opts;

    if (parentSignal && parentSignal.aborted) {
        return Promise.reject(new CancelledError());
    }

    return new Promise((resolve, reject) => {
        // Compose: parent signal OR our timeout → combined abort
        const ctrl = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            ctrl.abort();
        }, timeoutMs);

        const onParentAbort = () => ctrl.abort();
        if (parentSignal) {
            parentSignal.addEventListener("abort", onParentAbort, { once: true });
        }

        const cleanup = () => {
            clearTimeout(timer);
            if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
        };

        execFile(
            "bal",
            args,
            {
                env: { ...process.env, COLUMNS: "200" },
                signal: ctrl.signal,
                maxBuffer: 50 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
                cleanup();
                if (err) {
                    if (err.code === "ENOENT" || err.errno === "ENOENT") {
                        return reject(new BalNotInstalledError({ cause: err }));
                    }
                    if (parentSignal && parentSignal.aborted) {
                        return reject(new CancelledError());
                    }
                    if (timedOut) {
                        return reject(new TimeoutError(`bal ${args.join(" ")} timed out after ${timeoutMs}ms.`, { cause: err }));
                    }
                    if (err.name === "AbortError" || err.code === "ABORT_ERR") {
                        // Aborted but not because of our timer → caller cancellation
                        return reject(new CancelledError());
                    }
                    return reject(new BalCommandError(`bal ${args.join(" ")} exited non-zero.`, {
                        stderr: stderr || "",
                        exitCode: typeof err.code === "number" ? err.code : null,
                        cause: err,
                    }));
                }
                resolve({ stdout: stdout || "", stderr: stderr || "" });
            }
        );
    });
}

module.exports = {
    runBal,
    DEFAULTS,
};

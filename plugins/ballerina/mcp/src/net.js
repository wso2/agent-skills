"use strict";

// HTTP layer for Central API calls.
//
// Wraps the native `fetch` with:
//   - per-attempt timeout (default 30s)
//   - retry with exponential backoff and jitter (default 3 attempts)
//   - total wall-clock budget across attempts (default 15s)
//   - honours caller AbortSignal — re-throws CancelledError if it fires
//   - maps every failure mode to UpstreamError / TimeoutError / CancelledError
//
// Why retry only here and not in the bal-search wrapper? Central is a remote
// HTTP service that can hiccup with 5xx / 429 / DNS blips. `bal search` is a
// local subprocess — if it fails once it'll fail again.

const {
    UpstreamError,
    TimeoutError,
    CancelledError,
} = require("./errors.js");

const DEFAULTS = Object.freeze({
    timeoutMs: 120_000,     // per attempt — Central can be slow to respond for large orgs
    maxAttempts: 3,
    budgetMs: 60_000,       // total wall clock across all retries (covers a slow first attempt + 2 fast retries)
    baseDelayMs: 200,       // exponential backoff base
});

function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
            return reject(new CancelledError());
        }
        const t = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(t);
            reject(new CancelledError());
        };
        if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * Decide if an HTTP status code is retryable.
 */
function isRetryableStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Parse Retry-After header value (seconds or HTTP-date). Returns ms.
 */
function parseRetryAfter(header) {
    if (!header) return null;
    const asInt = parseInt(header, 10);
    if (!isNaN(asInt) && String(asInt) === header.trim()) {
        return asInt * 1000;
    }
    const asDate = Date.parse(header);
    if (!isNaN(asDate)) {
        return Math.max(0, asDate - Date.now());
    }
    return null;
}

/**
 * Backoff delay for attempt N (0-indexed) with jitter.
 */
function backoffMs(attempt, baseDelayMs) {
    const exp = baseDelayMs * Math.pow(2, attempt);
    // Add up to 25% jitter
    return Math.floor(exp * (1 + Math.random() * 0.25));
}

/**
 * Combine the caller's signal with our per-attempt timeout into a single AbortSignal.
 * Returns { signal, cleanup } so the caller can clear timers after the request resolves.
 */
function combineSignals(parent, timeoutMs) {
    const ctrl = new AbortController();
    let timeoutFired = false;

    const onParentAbort = () => ctrl.abort(new DOMException("parent-aborted", "AbortError"));
    if (parent) {
        if (parent.aborted) ctrl.abort(new DOMException("parent-aborted", "AbortError"));
        else parent.addEventListener("abort", onParentAbort, { once: true });
    }

    const timer = setTimeout(() => {
        timeoutFired = true;
        ctrl.abort(new DOMException("timeout", "AbortError"));
    }, timeoutMs);

    return {
        signal: ctrl.signal,
        cleanup: () => {
            clearTimeout(timer);
            if (parent) parent.removeEventListener("abort", onParentAbort);
        },
        wasTimeout: () => timeoutFired,
    };
}

/**
 * fetchJson — robust JSON GET against an upstream HTTP API.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal] — caller's signal (e.g. extra.signal from MCP)
 * @param {Function} [opts.fetch]  — override fetch (testing); defaults to globalThis.fetch
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.maxAttempts]
 * @param {number} [opts.budgetMs]
 * @param {number} [opts.baseDelayMs]
 * @returns parsed JSON body
 * @throws UpstreamError | TimeoutError | CancelledError
 */
async function fetchJson(url, opts = {}) {
    const fetchImpl = opts.fetch || globalThis.fetch;
    const {
        signal,
        timeoutMs = DEFAULTS.timeoutMs,
        maxAttempts = DEFAULTS.maxAttempts,
        budgetMs = DEFAULTS.budgetMs,
        baseDelayMs = DEFAULTS.baseDelayMs,
    } = opts;

    if (signal && signal.aborted) {
        throw new CancelledError();
    }

    const deadline = Date.now() + budgetMs;
    let lastErr;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Wait before retry (skip on first attempt)
        if (attempt > 0) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            const delay = Math.min(remaining, lastErr && lastErr._retryAfterMs ? Math.min(lastErr._retryAfterMs, remaining) : backoffMs(attempt - 1, baseDelayMs));
            try {
                await sleep(delay, signal);
            } catch (cancelled) {
                throw cancelled;
            }
        }

        const combo = combineSignals(signal, timeoutMs);
        let resp;
        try {
            resp = await fetchImpl(url, { signal: combo.signal });
        } catch (err) {
            combo.cleanup();
            if (signal && signal.aborted) {
                throw new CancelledError();
            }
            if (combo.wasTimeout() || (err && err.name === "AbortError")) {
                // Could be our timeout, or caller cancellation already handled above
                if (combo.wasTimeout()) {
                    lastErr = new TimeoutError(`Request to ${url} timed out after ${timeoutMs}ms.`, { cause: err });
                    continue;
                }
                throw new CancelledError();
            }
            lastErr = new UpstreamError("network", `Network error fetching ${url}: ${err && err.message ? err.message : err}`, {
                cause: err,
                details: { url, errno: err && err.code },
            });
            continue;
        }
        combo.cleanup();

        if (!resp.ok) {
            const retryAfterMs = parseRetryAfter(resp.headers && resp.headers.get ? resp.headers.get("retry-after") : null);
            const kind = resp.status === 429 ? "429" : (resp.status >= 500 ? "5xx" : "4xx");
            const err = new UpstreamError(kind, `Upstream returned HTTP ${resp.status} for ${url}.`, {
                retryable: isRetryableStatus(resp.status),
                details: { url, status: resp.status },
            });
            if (isRetryableStatus(resp.status)) {
                err._retryAfterMs = retryAfterMs;
                lastErr = err;
                continue;
            }
            throw err;
        }

        // Parse JSON. A bad payload is non-retryable (upstream is serving garbage).
        try {
            return await resp.json();
        } catch (parseErr) {
            throw new UpstreamError("malformed", `Could not parse JSON from ${url}: ${parseErr.message}`, {
                retryable: false,
                cause: parseErr,
                details: { url },
            });
        }
    }

    // Exhausted attempts
    if (signal && signal.aborted) throw new CancelledError();
    if (lastErr) throw lastErr;
    throw new UpstreamError("network", `Exhausted ${maxAttempts} attempts for ${url}.`, { details: { url } });
}

module.exports = {
    fetchJson,
    DEFAULTS,
};

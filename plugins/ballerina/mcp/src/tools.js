"use strict";

const centralClient = require("./central-client.js");
const { centralDocsToLibrary } = require("./central-to-library.js");
const { toSyntaxString } = require("./to-syntax-string.js");
const { postProcessLibrary } = require("./post-process.js");
const {
    ValidationError,
    CancelledError,
    formatErrorResult,
} = require("./errors.js");

function asTextResult(text) {
    return { content: [{ type: "text", text }] };
}

function formatSearchRows(rows) {
    if (rows.length === 0) {
        return "No packages found.";
    }
    const lines = ["NAME\tVERSION\tDESCRIPTION"];
    for (const row of rows) {
        lines.push(`${row.name}\t${row.version}\t${row.description}`);
    }
    return lines.join("\n");
}

function parseQualifiedName(name) {
    const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec((name || "").trim());
    if (!m) {
        throw new ValidationError(
            `Invalid package name '${name}'. Expected 'org/name' (no version suffix).`,
            { suggestion: "Drop any ':version' suffix and pass strictly 'org/name', e.g. 'ballerinax/github'.", details: { input: name } }
        );
    }
    return { org: m[1], name: m[2] };
}

/**
 * wrapTool — converts any thrown error inside a tool handler into a
 * { content, isError: true } result so the agent can see it and self-correct.
 *
 * Cancellation is a special case: if the caller's signal has aborted, we
 * re-throw so the SDK's own cancellation machinery handles the frame.
 */
function wrapTool(handler) {
    return async function wrappedTool(args, extra = {}) {
        try {
            const result = await handler(args, extra);
            return result;
        } catch (err) {
            // If the request was cancelled by the host, let the SDK abort the frame
            // rather than emitting an isError result for a request the client is no
            // longer listening to.
            const signal = extra && extra.signal;
            if (signal && signal.aborted) {
                throw err instanceof CancelledError ? err : new CancelledError(err && err.message);
            }
            return formatErrorResult(err, extra && extra.requestId);
        }
    };
}

async function searchLibrariesTool(args, extra = {}, deps = {}) {
    const query = args && args.query;
    if (!query) {
        throw new ValidationError("'query' is required.", {
            suggestion: "Pass a non-empty 'query' string, e.g. { query: 'gmail' }.",
        });
    }
    const rows = await centralClient.searchPackages(query, {
        signal: extra && extra.signal,
        execFile: deps.execFile,
    });
    return asTextResult(formatSearchRows(rows));
}

async function getLibraryTool(args, extra = {}, deps = {}) {
    const rawName = args && args.name;
    if (!rawName) {
        throw new ValidationError("'name' is required.", {
            suggestion: "Pass { name: 'org/package' }, e.g. { name: 'ballerinax/github' }.",
        });
    }
    const { org, name } = parseQualifiedName(rawName);
    const signal = extra && extra.signal;
    const fetch = deps.fetch;
    const version = await centralClient.resolveVersion(org, name, {
        version: args.version,
        projectDir: args.projectDir,
        signal,
        fetch,
    });
    const docs = await centralClient.fetchDocs(org, name, version, { signal, fetch });
    const library = postProcessLibrary(centralDocsToLibrary(docs));
    const syntax = toSyntaxString([library]);
    const header = `// Resolved: ${org}/${name}:${version}\n`;
    return asTextResult(header + syntax);
}

module.exports = {
    wrapTool,
    searchLibrariesTool,
    getLibraryTool,
    parseQualifiedName,
    formatSearchRows,
};

#!/usr/bin/env node
"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const {
    wrapTool,
    searchLibrariesTool,
    getLibraryTool,
} = require("./src/tools.js");

const SERVER_NAME = "ballerina-library";
const SERVER_VERSION = "0.4.0";

// ---------------------------------------------------------------------------
// Structured stderr logger. NEVER write to stdout — that's the MCP transport.
// ---------------------------------------------------------------------------

function log(level, event, fields = {}) {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        server: SERVER_NAME,
        event,
        ...fields,
    });
    process.stderr.write(line + "\n");
}

/**
 * Wrap a tool callback with start/end logging keyed by extra.requestId.
 */
function instrumentTool(toolName, handler) {
    return async (args, extra) => {
        const requestId = extra && extra.requestId;
        const start = Date.now();
        log("info", "tool.start", { tool: toolName, requestId });
        try {
            const result = await handler(args, extra);
            const durationMs = Date.now() - start;
            const isError = result && result.isError === true;
            let errorCode;
            if (isError) {
                try {
                    const body = JSON.parse(result.content[0].text);
                    errorCode = body.error;
                } catch { /* not our JSON — fall through */ }
            }
            log(isError ? "warn" : "info", "tool.end", {
                tool: toolName,
                requestId,
                durationMs,
                ok: !isError,
                errorCode,
            });
            return result;
        } catch (err) {
            const durationMs = Date.now() - start;
            log("error", "tool.throw", {
                tool: toolName,
                requestId,
                durationMs,
                message: err && err.message,
                code: err && err.code,
            });
            throw err;
        }
    };
}

async function main() {
    const server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
    });

    server.registerTool(
        "search_libraries",
        {
            title: "Search Ballerina Central libraries",
            description:
                "Search Ballerina Central for packages matching a keyword. Returns a tab-separated table of name, version, and description. Use this first to discover the correct org/name for a library, then call get_library. " +
                "Errors are returned as { isError: true, content: [{ type: 'text', text: '<JSON>' }] } — see the agent's 'Error handling' docs for the JSON shape.",
            inputSchema: {
                query: z.string().describe("Search keyword(s), e.g. 'gmail', 'stripe payment', 'mysql database'"),
            },
        },
        instrumentTool("search_libraries", wrapTool(searchLibrariesTool))
    );

    server.registerTool(
        "get_library",
        {
            title: "Get full Ballerina library API",
            description:
                "Fetch a Ballerina library's full API as a compact syntax string. Returns all clients, functions, type definitions, services, and annotations. The caller must filter to what their task needs. " +
                "Errors are returned as { isError: true, content: [{ type: 'text', text: '<JSON>' }] } — see the agent's 'Error handling' docs for the JSON shape.",
            inputSchema: {
                name: z
                    .string()
                    .describe("Package name as 'org/name' WITHOUT version suffix, e.g. 'ballerinax/github'"),
                version: z
                    .string()
                    .optional()
                    .describe("Optional explicit version. If omitted, Dependencies.toml in projectDir is consulted, otherwise the latest version from Central is used."),
                projectDir: z
                    .string()
                    .optional()
                    .describe("Optional path to a Ballerina project. Used to read Dependencies.toml for locked versions."),
            },
        },
        instrumentTool("get_library", wrapTool(getLibraryTool))
    );

    process.on("uncaughtException", (err) => {
        log("error", "uncaughtException", { message: err && err.message, stack: err && err.stack });
    });
    process.on("unhandledRejection", (reason) => {
        log("error", "unhandledRejection", { reason: String(reason) });
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("info", "server.ready", { name: SERVER_NAME, version: SERVER_VERSION });
}

main().catch((err) => {
    log("error", "server.fatal", { message: err && err.message, stack: err && err.stack });
    process.exit(1);
});

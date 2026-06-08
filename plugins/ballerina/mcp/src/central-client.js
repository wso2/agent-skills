"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { fetchJson } = require("./net.js");
const { runBal } = require("./exec.js");
const {
    PackageNotFoundError,
    UpstreamError,
} = require("./errors.js");

// Ballerina Central public REST API (v2.0). Endpoints used:
//   GET registry/packages?org=<org>&limit=1000&readme=false  — list an org's packages
//   GET docs/<org>/<name>/<version>                           — fetch a package's API docs
const CENTRAL_BASE_URL = "https://api.central.ballerina.io/2.0/";

// ---------------------------------------------------------------------------
// bal search parsing
// ---------------------------------------------------------------------------

function parseSearchOutput(stdout) {
    if (!stdout) {
        return [];
    }
    const rows = [];
    for (const rawLine of stdout.split("\n")) {
        const line = rawLine.trim();
        if (!line || !line.startsWith("|") || !line.endsWith("|")) {
            continue;
        }
        const cells = line.slice(1, -1).split("|").map((c) => c.trim());
        if (cells.length < 2) {
            continue;
        }
        const first = cells[0];
        // Skip header row and separator row
        if (first === "NAME" || /^-+$/.test(first)) {
            continue;
        }
        // A valid result row has org/name in the first column
        if (!first.includes("/")) {
            continue;
        }
        const [name, description = "", author = "", date = "", version = ""] = cells;
        rows.push({ name, description, author, date, version });
    }
    return rows;
}

// ---------------------------------------------------------------------------
// searchPackages
// ---------------------------------------------------------------------------

async function searchPackages(keyword, { execFile, signal } = {}) {
    // Take only the part before any shell metacharacter, then keep tokens that match
    // a safe allowlist. Even though we don't invoke a shell, this prevents the agent
    // (or a typo) from injecting flags or unrelated arguments into the bal command line.
    const firstChunk = String(keyword || "").split(/[;\n&|`<>$"'\\]/)[0].trim();
    const tokens = firstChunk
        .split(/\s+/)
        .filter((t) => /^[A-Za-z0-9._\-\/]+$/.test(t) && !t.startsWith("-"));
    if (tokens.length === 0) {
        return [];
    }
    const result = await runBal(["search", ...tokens], { execFile, signal });
    return parseSearchOutput(result.stdout || "");
}

// ---------------------------------------------------------------------------
// fetchOrgPackages
//   GET registry/packages?org=<org>&limit=1000&readme=false
// ---------------------------------------------------------------------------

async function fetchOrgPackages(org, { fetch, signal, limit = 1000 } = {}) {
    const url = `${CENTRAL_BASE_URL}registry/packages?org=${encodeURIComponent(org)}&limit=${limit}&readme=false`;
    const body = await fetchJson(url, { fetch, signal });
    return body.packages || [];
}

// ---------------------------------------------------------------------------
// resolveLatestVersion — filter to the exact org/name client-side
// ---------------------------------------------------------------------------

async function resolveLatestVersion(org, name, { fetch, signal } = {}) {
    const packages = await fetchOrgPackages(org, { fetch, signal });
    const exact = packages.find((p) => p.organization === org && p.name === name);
    if (!exact) {
        throw new PackageNotFoundError(`${org}/${name}`);
    }
    return exact.version;
}

// ---------------------------------------------------------------------------
// fetchDocs
//   GET docs/<org>/<name>/<version>
// ---------------------------------------------------------------------------

async function fetchDocs(org, name, version, { fetch, signal } = {}) {
    const url = `${CENTRAL_BASE_URL}docs/${encodeURIComponent(org)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    try {
        return await fetchJson(url, { fetch, signal });
    } catch (err) {
        // 404 from the docs endpoint means the (org, name, version) tuple isn't published.
        if (err instanceof UpstreamError && err.details && err.details.status === 404) {
            throw new PackageNotFoundError(`${org}/${name}:${version}`, {
                suggestion: `Verify the package exists and the version '${version}' is published. Run search_libraries to see available packages.`,
                details: { org, name, version },
            });
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Dependencies.toml parsing
// ---------------------------------------------------------------------------

function parseDependenciesToml(content) {
    const map = {};
    if (!content) {
        return map;
    }
    const lines = content.split("\n");
    let inPackage = false;
    let org;
    let name;
    let version;
    const flush = () => {
        if (inPackage && org && name && version) {
            map[`${org}/${name}`] = version;
        }
        org = undefined;
        name = undefined;
        version = undefined;
    };
    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith("[[package]]")) {
            flush();
            inPackage = true;
            continue;
        }
        if (line.startsWith("[")) {
            flush();
            inPackage = false;
            continue;
        }
        if (!inPackage) continue;
        const match = line.match(/^(\w+)\s*=\s*"([^"]*)"$/);
        if (!match) continue;
        const [, key, value] = match;
        if (key === "org") org = value;
        else if (key === "name") name = value;
        else if (key === "version") version = value;
    }
    flush();
    return map;
}

function readDependenciesVersions(projectDir, { dependenciesFileName = "Dependencies.toml" } = {}) {
    if (!projectDir) return {};
    const filePath = path.join(projectDir, dependenciesFileName);
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return parseDependenciesToml(content);
    } catch (err) {
        if (err && err.code === "ENOENT") return {};
        throw err;
    }
}

// ---------------------------------------------------------------------------
// resolveVersion — Dependencies.toml first, then Central fallback
// ---------------------------------------------------------------------------

async function resolveVersion(org, name, opts = {}) {
    const { version, projectDir, dependenciesFileName, fetch, signal } = opts;
    if (version) return version;
    const locked = readDependenciesVersions(projectDir, { dependenciesFileName });
    const lockedVersion = locked[`${org}/${name}`];
    if (lockedVersion) return lockedVersion;
    return resolveLatestVersion(org, name, { fetch, signal });
}

module.exports = {
    CENTRAL_BASE_URL,
    parseSearchOutput,
    searchPackages,
    fetchOrgPackages,
    resolveLatestVersion,
    fetchDocs,
    parseDependenciesToml,
    readDependenciesVersions,
    resolveVersion,
};

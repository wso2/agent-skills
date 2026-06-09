"use strict";

/**
 * Converts a Ballerina Central docs API response to a Library object.
 *
 * Input:  GET https://api.central.ballerina.io/2.0/docs/<org>/<name>/<version>
 * Output: Library object compatible with to-syntax-string.js
 */

// ---------------------------------------------------------------------------
// Type classification
// ---------------------------------------------------------------------------

// ExternalRecordTypeInCentral: has orgName (non-null, non-"UNK_ORG") + moduleName
// BasicTypeInCentral:          has name + category, no external org
// RefTypeInCentral:            only boolean flags (isAnonymousUnionType, etc.)
function classifyType(type) {
    if (type.orgName && type.orgName !== "UNK_ORG" && type.moduleName) {
        return "external";
    }
    if (type.name && type.category) {
        return "basic";
    }
    return "ref";
}

function getModuleNameSuffix(moduleName) {
    const parts = moduleName.split(".");
    return parts[parts.length - 1];
}

// ---------------------------------------------------------------------------
// Type mergers
// ---------------------------------------------------------------------------

function mergeUnionTypes(types) {
    const links = [];
    const name = types.map((t) => {
        if (t.links) links.push(...t.links);
        return t.name;
    }).join("|");
    const result = { name };
    if (links.length > 0) result.links = links;
    return result;
}

function mergeIntersectionTypes(types) {
    const links = [];
    const name = types.map((t) => {
        if (t.links) links.push(...t.links);
        return t.name;
    }).join("&");
    const result = { name };
    if (links.length > 0) result.links = links;
    return result;
}

function mergeStreamTypes(types) {
    const links = [];
    const inner = types.map((t) => {
        if (t.links) links.push(...t.links);
        return t.name;
    }).join(",");
    const result = { name: `stream<${inner}>` };
    if (links.length > 0) result.links = links;
    return result;
}

function mergeInlineRecordTypes(types) {
    const links = [];
    for (const t of types) {
        if (t.links) links.push(...t.links);
    }
    return { name: "record {}", links: links.length > 0 ? links : undefined };
}

function addOptional(type, isNullable) {
    if (!isNullable) return type;
    return { name: type.name + "?", links: type.links };
}

// ---------------------------------------------------------------------------
// transformCentralType
// ---------------------------------------------------------------------------

function transformExternalType(type, modId, orgName) {
    const sameModule = type.moduleName === modId && type.orgName === orgName;
    const links = [];
    let typeName = type.name;

    if (sameModule) {
        links.push({ category: "internal", recordName: type.name });
    } else {
        const libName = type.moduleName === "client.config"
            ? `${type.orgName}/'client.config`
            : `${type.orgName}/${type.moduleName}`;
        links.push({ category: "external", libraryName: libName, recordName: type.name });
        typeName = `${getModuleNameSuffix(type.moduleName)}:${typeName}`;
    }

    if (type.isArrayType) typeName += "[]";
    if (type.isNullable) typeName += "?";

    return { name: typeName, links };
}

function transformBasicType(type, modId, orgName) {
    const name = type.name;

    if (name === "stream") {
        const transformed = (type.memberTypes || []).map((m) => transformCentralType(m, modId, orgName));
        return mergeStreamTypes(transformed);
    }

    if (name === "map") {
        if (type.constraint) {
            const inner = transformCentralType(type.constraint, modId, orgName);
            return { name: `map<${inner.name}>` };
        }
        return { name: "map<any>" };
    }

    let result = name;
    if (type.isArrayType) result += "[]";
    if (type.isNullable) result += "?";
    return { name: result };
}

function transformRefType(type, modId, orgName) {
    const nullable = type.isNullable;

    if (type.isAnonymousUnionType) {
        const transformed = (type.memberTypes || []).map((m) => transformCentralType(m, modId, orgName));
        return addOptional(mergeUnionTypes(transformed), nullable);
    }

    if (type.isIntersectionType) {
        const transformed = (type.memberTypes || []).map((m) => transformCentralType(m, modId, orgName));
        return addOptional(mergeIntersectionTypes(transformed), nullable);
    }

    if (type.category === "inline_record" || type.category === "inline_closed_record") {
        const members = type.memberTypes || [];
        // Try InlineRecordFieldMember path (named fields)
        const first = members[0];
        if (first && first.name != null && first.elementType) {
            let recordStr = "record {";
            for (const m of members) {
                const fieldType = transformCentralType(m.elementType, modId, orgName);
                const opt = m.isOptional ? "?" : "";
                recordStr += `${fieldType.name}${opt} ${m.name}; `;
            }
            recordStr += "}";
            return addOptional({ name: recordStr }, nullable);
        }
        // Fallback: merge inline types
        const transformed = members.map((m) => transformCentralType(m, modId, orgName));
        return addOptional(mergeInlineRecordTypes(transformed), nullable);
    }

    if (type.elementType) {
        let result = transformCentralType(type.elementType, modId, orgName);
        if (type.isParenthesisedType) {
            result = { name: `(${result.name})`, links: result.links };
        }
        if (type.isArrayType) {
            result = { name: `${result.name}[]`, links: result.links };
        }
        if (type.isTypeDesc) {
            result = { name: `typedesc<${result.name}>`, links: result.links };
        }
        return addOptional(result, nullable);
    }

    // Fallback: inline record from memberTypes
    const transformed = (type.memberTypes || []).map((m) => transformCentralType(m, modId, orgName));
    return addOptional(mergeInlineRecordTypes(transformed), nullable);
}

function transformCentralType(type, modId, orgName) {
    const cls = classifyType(type);
    if (cls === "external") return transformExternalType(type, modId, orgName);
    if (cls === "basic")    return transformBasicType(type, modId, orgName);
    return transformRefType(type, modId, orgName);
}

// ---------------------------------------------------------------------------
// Parameters and return
// ---------------------------------------------------------------------------

function transformParameters(parameters, modId, orgName) {
    return (parameters || []).map((param) => {
        const type = transformCentralType(param.type, modId, orgName);
        const result = {
            name: param.name,
            description: (param.description || "").trim(),
            type,
        };
        const dv = (param.defaultValue || "").trim();
        if (dv !== "") result.default = dv;
        if (param.type && param.type.isNullable) result.optional = true;
        return result;
    });
}

function transformReturn(returnParameters, modId, orgName) {
    if (!returnParameters || returnParameters.length === 0) {
        return { type: { name: "nil" } };
    }
    const param = returnParameters[0];
    const type = transformCentralType(param.type, modId, orgName);
    const result = { type };
    const desc = (param.description || "").trim();
    if (desc) result.description = desc;
    return result;
}

// ---------------------------------------------------------------------------
// Resource path
// ---------------------------------------------------------------------------

function createPaths(resourcePath) {
    if (!resourcePath) return [];
    return resourcePath.split("/").map((segment) => {
        if (segment.startsWith("[") && segment.endsWith("]")) {
            const inner = segment.slice(1, -1);
            const spaceIdx = inner.indexOf(" ");
            if (spaceIdx === -1) return segment;
            return { type: inner.slice(0, spaceIdx), name: inner.slice(spaceIdx + 1) };
        }
        return segment;
    });
}

// ---------------------------------------------------------------------------
// Method transformation
// ---------------------------------------------------------------------------

function transformMethod(method, modId, orgName) {
    const parameters = transformParameters(method.parameters, modId, orgName);
    const ret = transformReturn(method.returnParameters, modId, orgName);
    const description = (method.description || "").trim();

    if (method.name === "init") {
        return { name: "init", type: "Constructor", description, parameters, return: ret };
    }

    if (method.isResource) {
        return {
            type: "Resource Function",
            accessor: method.accessor,
            paths: createPaths(method.resourcePath),
            description,
            parameters,
            return: ret,
        };
    }

    if (method.isRemote) {
        return { name: method.name, type: "Remote Function", description, parameters, return: ret };
    }

    return { name: method.name, type: "Normal Function", description, parameters, return: ret };
}

// ---------------------------------------------------------------------------
// Record field transformation
// ---------------------------------------------------------------------------

function transformRecordFields(fields, modId, orgName) {
    const fieldMap = new Map();

    for (const field of fields || []) {
        if (field.inclusionType) {
            // InclusionField: expand members from inclusionType
            for (const member of field.inclusionType.memberTypes || []) {
                if (member.name) {
                    fieldMap.set(member.name, {
                        name: member.name,
                        description: (member.description || "").trim(),
                        type: transformCentralType(member.elementType, modId, orgName),
                    });
                }
            }
        } else {
            // ConcreteField
            const type = transformCentralType(field.type, modId, orgName);
            const f = {
                name: field.name,
                description: (field.description || "").trim(),
                type,
            };
            const dv = (field.defaultValue || "").trim();
            if (dv !== "") f.default = dv;
            if (field.type && field.type.isOptional) f.optional = true;
            fieldMap.set(field.name, f);
        }
    }

    return Array.from(fieldMap.values());
}

// ---------------------------------------------------------------------------
// Main entry: centralDocsToLibrary
// ---------------------------------------------------------------------------

function centralDocsToLibrary(centralApiResponse) {
    const mod = centralApiResponse.docsData.modules[0];
    const modId = mod.id;
    const orgName = mod.orgName;

    const typeDefs = [];

    for (const rec of mod.records || []) {
        typeDefs.push({
            type: "Record",
            name: rec.name,
            description: (rec.description || "").trim(),
            fields: transformRecordFields(rec.fields, modId, orgName),
        });
    }

    for (const t of mod.stringTypes || []) {
        typeDefs.push({ type: "string", name: t.name, description: (t.description || "").trim() });
    }

    for (const t of mod.integerTypes || []) {
        typeDefs.push({ type: "int", name: t.name, description: (t.description || "").trim() });
    }

    for (const t of mod.decimalTypes || []) {
        typeDefs.push({ type: "decimal", name: t.name, description: (t.description || "").trim() });
    }

    for (const t of mod.arrayTypes || []) {
        const first = (t.memberTypes || [])[0];
        const resolved = first ? transformCentralType(first, modId, orgName) : { name: "any" };
        typeDefs.push({ type: resolved.name, name: t.name, description: (t.description || "").trim() });
    }

    for (const e of mod.errors || []) {
        typeDefs.push({ type: "error", name: e.name, description: (e.description || "").trim() });
    }

    for (const c of mod.constants || []) {
        typeDefs.push({
            type: "Constant",
            name: c.name,
            description: (c.description || "").trim(),
            value: c.value,
            varType: transformCentralType(c.type, modId, orgName),
        });
    }

    for (const e of mod.enums || []) {
        typeDefs.push({
            type: "Enum",
            name: e.name,
            description: (e.description || "").trim(),
            members: (e.members || []).map((m) => ({
                name: m.name,
                description: (m.description || "").trim(),
            })),
        });
    }

    for (const cls of mod.classes || []) {
        typeDefs.push({ type: "Class", name: cls.name, description: "", functions: [] });
    }

    for (const obj of mod.objectTypes || []) {
        typeDefs.push({ type: "Class", name: obj.name, description: "", functions: [] });
    }

    for (const u of mod.unionTypes || []) {
        typeDefs.push({ type: "Union", name: u.name, description: (u.description || "").trim(), members: [] });
    }

    for (const i of mod.intersectionTypes || []) {
        typeDefs.push({ type: "IntersectionType", name: i.name, description: (i.description || "").trim(), members: [] });
    }

    for (const s of mod.simpleNameReferenceTypes || []) {
        typeDefs.push({ type: "var_ref", name: s.name, description: (s.description || "").trim() });
    }

    for (const b of mod.booleanTypes || []) {
        typeDefs.push({ type: "boolean", name: b.name, description: (b.description || "").trim() });
    }

    const clients = (mod.clients || []).map((cli) => ({
        name: cli.name,
        description: (cli.description || "").trim(),
        functions: (cli.methods || []).map((m) => transformMethod(m, modId, orgName)),
    }));

    const allFunctions = (mod.functions || []).map((m) => transformMethod(m, modId, orgName));
    const functions = allFunctions.filter((f) => f.type === "Normal Function" || f.type === "Remote Function");

    return {
        name: `${orgName}/${modId}`,
        description: (mod.summary || "").trim(),
        typeDefs,
        clients,
        functions,
    };
}

module.exports = {
    centralDocsToLibrary,
    transformCentralType,
    transformMethod,
    createPaths,
    transformRecordFields,
};

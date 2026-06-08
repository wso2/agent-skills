"use strict";

// Post-processing for Library objects. Two intents:
//
// 1. Apply deterministic, library-specific patches so the output matches what
//    `bal library get` produces for the same package (e.g. the sheets Range
//    field shape, the slack OkTrueDef collapse). The http/graphql/ai service
//    injectors attach the same generic listener structure with an empty
//    instructions field.
//
// 2. Collapse non-renderable typeDef.type strings to "Other" to match what
//    `bal library get` produces (only Record / Enum / Union / Class / Constant
//    are kept; everything else becomes "Other").

const LS_STANDARD_TYPES = new Set(["Record", "Enum", "Union", "Class", "Constant", "Error"]);

function normalizeTypeDefTypes(library) {
    if (!library || !Array.isArray(library.typeDefs)) return library;
    for (const t of library.typeDefs) {
        // The docs API tags errors as lowercase "error"; bal library get uses capitalized "Error".
        if (t.type === "error") {
            t.type = "Error";
            continue;
        }
        if (LS_STANDARD_TYPES.has(t.type)) continue;
        // The LS treats intersection types as unions in its Library JSON.
        // Anything else outside the standard kinds collapses to "Other".
        if (t.type === "IntersectionType") {
            t.type = "Union";
        } else {
            t.type = "Other";
        }
    }
    return library;
}

// Patch: ballerinax/googleapis.sheets — correct the Range 2D-array field shape
function fixSheets2DArray(library) {
    if (!library || library.name !== "ballerinax/googleapis.sheets") return library;
    const range = (library.typeDefs || []).find((t) => t.type === "Record" && t.name === "Range");
    if (!range || !Array.isArray(range.fields) || range.fields.length < 2) return library;
    const secondField = range.fields[1];
    if (!secondField.type) secondField.type = {};
    secondField.type.name = "(int|string|decimal)[][]";
    return library;
}

// Patch: ballerinax/sap — prepend the ClientError / RequestMessage type defs
function addLibsToSap(library) {
    if (!library || library.name !== "ballerinax/sap") return library;
    library.typeDefs = [
        { name: "ClientError", description: "Defines the possible client error types.", type: "error" },
        { name: "RequestMessage", description: "The types of messages that are accepted by HTTP client when sending out the outbound request.", type: "anydata" },
        ...(library.typeDefs || []),
    ];
    return library;
}

// Patch: ballerinax/slack — collapse OkTrueDef to the literal `true`
function removeOkTrueDef(library) {
    if (!library || library.name !== "ballerinax/slack") return library;

    for (const td of library.typeDefs || []) {
        if (td.type !== "Record" || !Array.isArray(td.fields)) continue;
        for (const f of td.fields) {
            if (f.type && f.type.name === "OkTrueDef") {
                f.type = { name: "true" };
            }
        }
    }

    for (const client of library.clients || []) {
        for (const func of client.functions || []) {
            const t = func.return && func.return.type;
            if (!t || !Array.isArray(t.links)) continue;
            t.links = t.links.filter((l) => l.recordName !== "OkTrueDef");
            if (t.links.length === 0) delete t.links;
        }
    }
    return library;
}

// Patch: ballerinax/client.config — quote the reserved module-name segment
function changeClientConfigName(library) {
    if (!library || library.name !== "ballerinax/client.config") return library;
    library.name = "ballerinax/'client.config";
    return library;
}

// Patch: ballerina/graphql — simplify ErrorDetail.locations to json[]
function removeGraphQLParser(library) {
    if (!library || library.name !== "ballerina/graphql") return library;
    for (const td of library.typeDefs || []) {
        if (td.type !== "Record" || td.name !== "ErrorDetail") continue;
        for (const f of td.fields || []) {
            if (f.name === "locations") {
                f.type = { name: "json[]" };
            }
        }
    }
    return library;
}

// Patch: ballerina/ai* — drop the ChatClient client
function removeChatClientFromBallerinaAi(library) {
    if (!library || typeof library.name !== "string") return library;
    if (!library.name.startsWith("ballerina/ai")) return library;
    library.clients = (library.clients || []).filter((c) => c.name !== "ChatClient");
    return library;
}

function _attachGenericService(library, listenerParam, instructions) {
    library.services = [
        {
            type: "generic",
            instructions: instructions || "",
            listener: {
                name: "Listener",
                parameters: [listenerParam],
            },
        },
    ];
    return library;
}

// Patch: ballerina/http — inject the generic service listener
function addHttpService(library) {
    if (!library || library.name !== "ballerina/http") return library;
    return _attachGenericService(library, {
        name: "port",
        description: "Listening port of the HTTP service listener",
        type: { name: "int" },
    });
}

// Patch: ballerina/graphql — inject the generic service listener
function addGraphQLService(library) {
    if (!library || library.name !== "ballerina/graphql") return library;
    return _attachGenericService(library, {
        name: "listenTo",
        description: "Port number to listen to the GraphQL service endpoint.",
        type: { name: "int" },
    });
}

// Patch: ballerina/ai — inject the generic service listener
function addAiService(library) {
    if (!library || library.name !== "ballerina/ai") return library;
    return _attachGenericService(library, {
        name: "listenOn",
        description: "Listening port of the HTTP service listener",
        type: { name: "int" },
    });
}

function postProcessLibrary(library) {
    fixSheets2DArray(library);
    addLibsToSap(library);
    removeOkTrueDef(library);
    changeClientConfigName(library);
    removeGraphQLParser(library);
    removeChatClientFromBallerinaAi(library);
    addHttpService(library);
    addGraphQLService(library);
    addAiService(library);
    normalizeTypeDefTypes(library);
    return library;
}

module.exports = {
    LS_STANDARD_TYPES,
    normalizeTypeDefTypes,
    fixSheets2DArray,
    addLibsToSap,
    removeOkTrueDef,
    changeClientConfigName,
    removeGraphQLParser,
    removeChatClientFromBallerinaAi,
    addHttpService,
    addGraphQLService,
    addAiService,
    postProcessLibrary,
};

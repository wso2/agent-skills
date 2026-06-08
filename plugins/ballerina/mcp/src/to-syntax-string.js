"use strict";

// Port of vscode-extensions/.../ai/utils/libs/to-syntax-string.ts
// Converts a Library object into a compact Ballerina-syntax string for LLM consumption.

const ATTACHMENT_POINT_LABELS = {
    SERVICE: "service",
    OBJECT_METHOD: "service_function",
};

function deriveModulePrefix(libraryName) {
    const parts = libraryName.split(/[/.]/);
    return parts[parts.length - 1];
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectExternalLinks(type) {
    if (!type || !type.links) {
        return [];
    }
    return type.links
        .filter((link) => link.category === "external" && !!link.libraryName)
        .map((link) => ({
            recordName: link.recordName,
            libraryName: link.libraryName,
            modulePrefix: deriveModulePrefix(link.libraryName),
        }));
}

function applyPrefixToTypeName(typeName, externalLinks) {
    let result = typeName;
    for (const link of externalLinks) {
        const regex = new RegExp(`\\b${escapeRegExp(link.recordName)}\\b`, "g");
        result = result.replace(regex, `${link.modulePrefix}:${link.recordName}`);
    }
    return result;
}

function buildSpecialAgentNote(externalLinks) {
    if (externalLinks.length === 0) {
        return "";
    }
    const grouped = new Map();
    for (const link of externalLinks) {
        if (!grouped.has(link.libraryName)) {
            grouped.set(link.libraryName, []);
        }
        grouped.get(link.libraryName).push(link.recordName);
    }
    const parts = [];
    for (const [libName, recordNames] of grouped) {
        parts.push(`${recordNames.join(", ")} FROM ${libName} package`);
    }
    return ` // Special Agent Note: ${parts.join(", ")}`;
}

function renderDescription(description) {
    if (!description || description.trim() === "") {
        return "";
    }
    return description
        .split("\n")
        .map((line) => `# ${line}`)
        .join("\n") + "\n";
}

function renderDeprecation(isDeprecated) {
    return isDeprecated ? "@deprecated\n" : "";
}

function renderRecord(typeDef) {
    const lines = [];
    lines.push(renderDescription(typeDef.description));
    if (typeDef.isDeprecated) {
        lines.push("@deprecated");
    }
    lines.push(`type ${typeDef.name} record {`);

    for (const field of typeDef.fields) {
        const externalLinks = collectExternalLinks(field.type);
        const typeName = applyPrefixToTypeName(field.type.name, externalLinks);
        const optional = field.optional ? "?" : "";
        const defaultVal = field.default !== undefined ? ` = ${field.default}` : "";
        const fieldDesc = field.description ? `    # ${field.description}\n` : "";
        const fieldDeprecated = field.isDeprecated ? "    @deprecated\n" : "";
        const agentNote = buildSpecialAgentNote(externalLinks);
        lines.push(`${fieldDesc}${fieldDeprecated}    ${typeName} ${field.name}${optional}${defaultVal};${agentNote}`);
    }

    lines.push("};");
    return lines.join("\n");
}

function renderEnum(typeDef) {
    const lines = [];
    lines.push(renderDescription(typeDef.description));
    if (typeDef.isDeprecated) {
        lines.push("@deprecated\n");
    }
    const members = typeDef.members.map((m) => m.name).join(",\n    ");
    lines.push(`enum ${typeDef.name} {\n    ${members}\n}`);
    return lines.join("");
}

function renderUnion(typeDef) {
    const desc = renderDescription(typeDef.description);
    const dep = renderDeprecation(typeDef.isDeprecated);
    if (!typeDef.members || typeDef.members.length === 0) {
        return `${desc}${dep}type ${typeDef.name};`;
    }
    const members = typeDef.members.map((m) => m.name).join("|");
    return `${desc}${dep}type ${typeDef.name} ${members};`;
}

function renderConstant(typeDef) {
    const desc = renderDescription(typeDef.description);
    const dep = renderDeprecation(typeDef.isDeprecated);
    const value = typeDef.varType.name === "string" ? `"${typeDef.value}"` : typeDef.value;
    return `${desc}${dep}const ${typeDef.varType.name} ${typeDef.name} = ${value};`;
}

function renderClass(typeDef) {
    const desc = renderDescription(typeDef.description);
    const dep = renderDeprecation(typeDef.isDeprecated);
    return `${desc}${dep}class ${typeDef.name} {\n}`;
}

function renderTypeDef(typeDef) {
    switch (typeDef.type) {
        case "Record":
            return renderRecord(typeDef);
        case "Enum":
            return renderEnum(typeDef);
        case "Union":
            return renderUnion(typeDef);
        case "Constant":
            return renderConstant(typeDef);
        case "Class":
            return renderClass(typeDef);
        default:
            return `// Unknown type: ${typeDef.name}`;
    }
}

function collectFunctionExternalLinks(params, returnType) {
    const links = [];
    for (const param of params) {
        links.push(...collectExternalLinks(param.type));
    }
    if (returnType) {
        links.push(...collectExternalLinks(returnType));
    }
    const seen = new Set();
    return links.filter((l) => {
        const key = `${l.recordName}::${l.libraryName}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function renderParam(param) {
    const externalLinks = collectExternalLinks(param.type);
    const typeName = applyPrefixToTypeName(param.type.name, externalLinks);
    const defaultVal = param.default !== undefined ? ` = ${param.default}` : "";
    return `${typeName} ${param.name}${defaultVal}`;
}

function renderConstructor(func) {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return && func.return.type);
    const params = func.parameters.map(renderParam).join(", ");
    const returnStr = func.return && func.return.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    return `    function init(${params})${returnStr};${agentNote}`;
}

function renderRemoteFunction(func, indent = "    ") {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return && func.return.type);
    const desc = func.description ? `${indent}# ${func.description.split("\n").join(`\n${indent}# `)}\n` : "";
    const dep = func.isDeprecated ? `${indent}@deprecated\n` : "";
    const params = func.parameters.map(renderParam).join(", ");
    const returnStr = func.return && func.return.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    return `${desc}${dep}${indent}remote function ${func.name}(${params})${returnStr};${agentNote}`;
}

function renderResourceFunction(func, indent = "    ") {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return && func.return.type);
    const desc = func.description ? `${indent}# ${func.description.split("\n").join(`\n${indent}# `)}\n` : "";
    const dep = func.isDeprecated ? `${indent}@deprecated\n` : "";

    const pathSegments = func.paths.map((p) => {
        if (typeof p === "string") {
            return p;
        }
        return `[${p.type} ${p.name}]`;
    });
    const pathStr = pathSegments.join("/");

    const pathParamNames = new Set(
        func.paths
            .filter((p) => typeof p !== "string")
            .map((p) => p.name)
    );
    const nonPathParams = func.parameters.filter((p) => !pathParamNames.has(p.name));
    const params = nonPathParams.map(renderParam).join(", ");

    const returnStr = func.return && func.return.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    return `${desc}${dep}${indent}resource function ${func.accessor} ${pathStr}(${params})${returnStr};${agentNote}`;
}

function renderClient(client) {
    const lines = [];
    const desc = client.description ? renderDescription(client.description) : "";
    const dep = client.isDeprecated ? "@deprecated\n" : "";
    lines.push(`${desc}${dep}client class ${client.name} {`);

    for (const func of client.functions) {
        if ("type" in func && func.type === "Constructor") {
            lines.push(renderConstructor(func));
        } else if ("accessor" in func) {
            lines.push("");
            lines.push(renderResourceFunction(func));
        } else {
            lines.push("");
            lines.push(renderRemoteFunction(func));
        }
    }

    lines.push("}");
    return lines.join("\n");
}

function renderStandaloneFunction(func) {
    const allExternalLinks = collectFunctionExternalLinks(func.parameters, func.return && func.return.type);
    const lines = [];

    if (func.description) {
        const descLines = func.description.split("\n").map((l) => `# ${l}`);
        lines.push(...descLines);
    }

    for (const param of func.parameters) {
        if (param.description) {
            lines.push(`# + ${param.name} - ${param.description}`);
        }
    }

    if (func.return && func.return.description) {
        lines.push(`# + return - ${func.return.description}`);
    }

    if (func.isDeprecated) {
        lines.push("@deprecated");
    }

    const params = func.parameters.map(renderParam).join(", ");
    const returnStr = func.return && func.return.type ? ` returns ${applyPrefixToTypeName(func.return.type.name, allExternalLinks)}` : "";
    const agentNote = buildSpecialAgentNote(allExternalLinks);
    lines.push(`function ${func.name}(${params})${returnStr};${agentNote}`);

    return lines.join("\n");
}

function renderParamDef(param) {
    return `${param.type.name}${param.name ? " " + param.name : ""}`;
}

function renderGenericService(service) {
    const lines = [];
    const listenerParams = service.listener.parameters.map(
        (p) => `${p.type.name} ${p.name}`
    ).join(", ");
    lines.push(`// --- Service (generic) ---`);
    if (service.name) {
        lines.push(`// Service Type: ${service.name}`);
    }
    if (service.isDeprecated) {
        lines.push(`// Deprecated`);
    }
    lines.push(`// Listener: ${service.listener.name}(${listenerParams})`);
    lines.push(`// Instructions:`);
    if (service.instructions) {
        lines.push(service.instructions);
    }
    return lines.join("\n");
}

function deriveListenerAlias(listenerName) {
    const idx = listenerName.indexOf(":");
    return idx > 0 ? listenerName.substring(0, idx) : null;
}

function renderFixedService(service) {
    const lines = [];
    const listenerParams = service.listener.parameters.map(
        (p) => `${p.type.name} ${p.name}${p.default !== undefined ? ` = ${p.default}` : ""}`
    ).join(", ");

    if (service.isDeprecated) {
        lines.push("@deprecated");
    }

    const alias = deriveListenerAlias(service.listener.name);
    const serviceTypePrefix = service.name && alias
        ? `${alias}:${service.name} `
        : "";
    lines.push(`service ${serviceTypePrefix}on new ${service.listener.name}(${listenerParams}) {`);

    for (const method of service.methods) {
        const desc = method.description ? `    # ${method.description}\n` : "";
        const dep = method.isDeprecated ? "    @deprecated\n" : "";
        const params = method.parameters.map((p) => renderParamDef(p)).join(", ");
        const returnStr = method.return && method.return.type ? ` returns ${method.return.type.name}` : "";
        const optionalComment = method.optional ? " // optional" : "";

        lines.push(`${desc}${dep}    remote function ${method.name}(${params})${returnStr};${optionalComment}`);
        lines.push("");
    }

    if (lines[lines.length - 1] === "") {
        lines.pop();
    }

    lines.push("}");
    return lines.join("\n");
}

function renderAnnotation(annotation) {
    const point = ATTACHMENT_POINT_LABELS[annotation.attachmentPoint];
    if (!point) {
        return null;
    }

    const lines = [];
    if (annotation.description) {
        const descBody = annotation.description
            .split("\n")
            .map((l) => `# ${l}`)
            .join("\n");
        lines.push(descBody);
    }

    let typeSlot = "";
    let agentNote = "";
    if (annotation.typeConstraint) {
        const externalLinks = collectExternalLinks(annotation.typeConstraint);
        const typeName = applyPrefixToTypeName(annotation.typeConstraint.name, externalLinks);
        typeSlot = `${typeName} `;
        agentNote = buildSpecialAgentNote(externalLinks);
    }

    lines.push(`public annotation ${typeSlot}${annotation.name} on ${point};${agentNote}`);
    return lines.join("\n");
}

function renderService(service) {
    if (service.type === "generic") {
        return renderGenericService(service);
    }
    return renderFixedService(service);
}

function toSyntaxString(libraries) {
    const output = [];

    for (const lib of libraries) {
        output.push(`// ============================================================`);
        output.push(`// Library: ${lib.name}`);
        if (lib.description) {
            output.push(`// ${lib.description.split("\n")[0]}`);
        }
        output.push(`// ============================================================`);
        output.push(`import ${lib.name};`);

        if (lib.instructions) {
            output.push("");
            output.push(lib.instructions);
        }

        if (lib.readme) {
            output.push("");
            output.push("// --- README ---");
            output.push(lib.readme);
            output.push("// --- END README ---");
        }

        if (lib.typeDefs && lib.typeDefs.length > 0) {
            output.push("");
            output.push("// --- Types ---");
            for (const typeDef of lib.typeDefs) {
                output.push("");
                output.push(renderTypeDef(typeDef));
            }
        }

        if (lib.clients && lib.clients.length > 0) {
            output.push("");
            output.push("// --- Client ---");
            for (const client of lib.clients) {
                output.push("");
                output.push(renderClient(client));
            }
        }

        if (lib.functions && lib.functions.length > 0) {
            output.push("");
            output.push("// --- Functions ---");
            for (const func of lib.functions) {
                output.push("");
                output.push(renderStandaloneFunction(func));
            }
        }

        if (lib.services && lib.services.length > 0) {
            output.push("");
            output.push("// --- Service ---");
            for (const service of lib.services) {
                output.push("");
                output.push(renderService(service));
            }
        }

        if (lib.annotations && lib.annotations.length > 0) {
            const renderedAnnotations = lib.annotations
                .map(renderAnnotation)
                .filter((rendered) => rendered !== null);
            if (renderedAnnotations.length > 0) {
                output.push("");
                output.push("// --- Annotations ---");
                for (const rendered of renderedAnnotations) {
                    output.push("");
                    output.push(rendered);
                }
            }
        }

        output.push("");
    }

    return output.join("\n");
}

module.exports = {
    toSyntaxString,
    deriveModulePrefix,
    renderTypeDef,
    renderClient,
    renderStandaloneFunction,
    renderService,
    renderAnnotation,
    collectExternalLinks,
    applyPrefixToTypeName,
    buildSpecialAgentNote,
};

import { autocompletion } from "@codemirror/autocomplete";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, lintKeymap } from "@codemirror/lint";
import type { Diagnostic, LintSource } from "@codemirror/lint";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { isAlias, isMap, isNode, isScalar, parseDocument } from "yaml";
import type { Pair } from "yaml";

type PropertyKind = "scalar" | "mapping" | "sequence";

interface ComposeProperty {
    label: string;
    kind?: PropertyKind;
    detail?: string;
    info?: string;
}

const property = (label: string, kind: PropertyKind = "scalar", detail?: string, info?: string): ComposeProperty => ({
    label,
    kind,
    detail,
    info,
});

const topLevelProperties = [
    property("name", "scalar", "project name"),
    property("services", "mapping", "service definitions"),
    property("networks", "mapping", "named networks"),
    property("volumes", "mapping", "named volumes"),
    property("configs", "mapping", "shared configurations"),
    property("secrets", "mapping", "shared secrets"),
    property("models", "mapping", "AI model definitions"),
    property("include", "sequence", "included Compose projects"),
    property("version", "scalar", "deprecated"),
];

const serviceProperties = [
    property("image", "scalar", "container image"),
    property("build", "mapping", "build configuration"),
    property("command", "scalar", "override image command"),
    property("entrypoint", "scalar", "override image entrypoint"),
    property("container_name", "scalar", "container name"),
    property("environment", "mapping", "environment variables"),
    property("env_file", "sequence", "environment files"),
    property("ports", "sequence", "published ports"),
    property("expose", "sequence", "exposed ports"),
    property("volumes", "sequence", "volume mounts"),
    property("volumes_from", "sequence", "inherited mounts"),
    property("networks", "mapping", "attached networks"),
    property("network_mode", "scalar", "network mode"),
    property("depends_on", "mapping", "service dependencies"),
    property("healthcheck", "mapping", "container health check"),
    property("restart", "scalar", "restart policy"),
    property("pull_policy", "scalar", "image pull policy"),
    property("deploy", "mapping", "deployment configuration"),
    property("develop", "mapping", "development configuration"),
    property("profiles", "sequence", "enabled profiles"),
    property("labels", "mapping", "container labels"),
    property("label_file", "sequence", "label files"),
    property("logging", "mapping", "logging configuration"),
    property("configs", "sequence", "attached configurations"),
    property("secrets", "sequence", "attached secrets"),
    property("models", "mapping", "attached AI models"),
    property("devices", "sequence", "device mappings"),
    property("device_cgroup_rules", "sequence", "device cgroup rules"),
    property("dns", "sequence", "DNS servers"),
    property("dns_opt", "sequence", "DNS options"),
    property("dns_search", "sequence", "DNS search domains"),
    property("extra_hosts", "mapping", "host mappings"),
    property("hostname"),
    property("domainname"),
    property("links", "sequence"),
    property("external_links", "sequence"),
    property("annotations", "mapping"),
    property("attach"),
    property("blkio_config", "mapping"),
    property("cap_add", "sequence"),
    property("cap_drop", "sequence"),
    property("cgroup"),
    property("cgroup_parent"),
    property("cpu_count"),
    property("cpu_percent"),
    property("cpu_period"),
    property("cpu_quota"),
    property("cpu_rt_period"),
    property("cpu_rt_runtime"),
    property("cpu_shares"),
    property("cpus"),
    property("cpuset"),
    property("credential_spec", "mapping"),
    property("extends", "mapping"),
    property("gpus", "sequence"),
    property("group_add", "sequence"),
    property("init"),
    property("ipc"),
    property("isolation"),
    property("mac_address"),
    property("mem_limit"),
    property("mem_reservation"),
    property("mem_swappiness"),
    property("memswap_limit"),
    property("oom_kill_disable"),
    property("oom_score_adj"),
    property("pid"),
    property("pids_limit"),
    property("platform"),
    property("post_start", "sequence"),
    property("pre_start", "sequence"),
    property("pre_stop", "sequence"),
    property("privileged"),
    property("provider", "mapping"),
    property("pull_refresh_after"),
    property("read_only"),
    property("runtime"),
    property("scale"),
    property("security_opt", "sequence"),
    property("shm_size"),
    property("stdin_open"),
    property("stop_grace_period"),
    property("stop_signal"),
    property("storage_opt", "mapping"),
    property("sysctls", "mapping"),
    property("tmpfs", "sequence"),
    property("tty"),
    property("ulimits", "mapping"),
    property("use_api_socket"),
    property("user"),
    property("userns_mode"),
    property("uts"),
    property("working_dir"),
];

const nestedProperties: Record<string, ComposeProperty[]> = {
    build: [
        property("context"), property("dockerfile"), property("dockerfile_inline"), property("args", "mapping"),
        property("target"), property("cache_from", "sequence"), property("cache_to", "sequence"), property("no_cache"),
        property("pull"), property("tags", "sequence"), property("platforms", "sequence"), property("ssh", "mapping"),
        property("secrets", "sequence"), property("extra_hosts", "mapping"), property("network"), property("shm_size"),
        property("privileged"), property("provenance"), property("sbom"),
    ],
    deploy: [
        property("mode"), property("replicas"), property("endpoint_mode"), property("labels", "mapping"),
        property("placement", "mapping"), property("update_config", "mapping"), property("rollback_config", "mapping"),
        property("resources", "mapping"), property("restart_policy", "mapping"),
    ],
    develop: [ property("watch", "sequence") ],
    healthcheck: [
        property("test", "sequence"), property("interval"), property("timeout"), property("retries"),
        property("start_period"), property("start_interval"), property("disable"),
    ],
    logging: [ property("driver"), property("options", "mapping") ],
};

const networkProperties = [
    property("driver"), property("driver_opts", "mapping"), property("attachable"), property("enable_ipv4"),
    property("enable_ipv6"), property("internal"), property("ipam", "mapping"), property("external"),
    property("name"), property("labels", "mapping"),
];

const volumeProperties = [
    property("driver"), property("driver_opts", "mapping"), property("external"), property("labels", "mapping"),
    property("name"),
];

const configOrSecretProperties = [
    property("file"), property("environment"), property("content"), property("external"), property("name"),
];

const valueCompletions: Record<string, string[]> = {
    condition: [ "service_started", "service_healthy", "service_completed_successfully" ],
    network_mode: [ "bridge", "host", "none" ],
    pull_policy: [ "always", "never", "build", "if_not_present", "missing", "daily", "weekly" ],
    restart: [ "no", "always", "on-failure", "unless-stopped" ],
};

const booleanProperties = new Set([
    "attach", "attachable", "disable", "enable_ipv4", "enable_ipv6", "external", "init", "internal", "no_cache",
    "oom_kill_disable", "privileged", "pull", "read_only", "required", "stdin_open", "tty", "use_api_socket",
]);

const topLevelKeys = new Set(topLevelProperties.map(item => item.label));
const mappingTopLevelKeys = new Set([ "services", "networks", "volumes", "configs", "secrets", "models" ]);

export function isComposeFile(relativePath: string): boolean {
    const fileName = relativePath.split(/[\\/]/).pop() ?? "";
    return /^(?:docker-)?compose(?:\.[a-z0-9_-]+)?\.ya?ml$/i.test(fileName);
}

export function isYamlFile(relativePath: string): boolean {
    return /\.ya?ml$/i.test(relativePath);
}

export function createTextEditorExtensions(): Extension[] {
    return [
        search({
            top: true,
        }),
        keymap.of(searchKeymap),
    ];
}

export function createYamlEditorExtensions(compose = false): Extension[] {
    const lintSource: LintSource = view => getYamlDiagnostics(view.state.doc.toString(), compose);
    const extensions = [
        ...createTextEditorExtensions(),
        yaml(),
        linter(lintSource, {
            delay: 300,
        }),
        lintGutter(),
        keymap.of(lintKeymap),
    ];

    if (compose) {
        extensions.push(autocompletion({
            override: [ composeCompletionSource ],
        }));
    }

    return extensions;
}

export function createFileEditorExtensions(relativePath: string): Extension[] {
    if (isComposeFile(relativePath)) {
        return createYamlEditorExtensions(true);
    }
    if (isYamlFile(relativePath)) {
        return createYamlEditorExtensions(false);
    }
    return createTextEditorExtensions();
}

export function openEditorSearch(view?: EditorView): boolean {
    return view ? openSearchPanel(view) : false;
}

export function getYamlDiagnostics(source: string, compose = false): Diagnostic[] {
    const document = parseDocument(source, {
        prettyErrors: false,
        strict: true,
        uniqueKeys: true,
    });
    const diagnostics: Diagnostic[] = [
        ...document.errors.map(error => yamlErrorDiagnostic(error, "error", source.length)),
        ...document.warnings.map(error => yamlErrorDiagnostic(error, "warning", source.length)),
        ...indentationDiagnostics(source),
    ];

    if (compose && document.errors.length === 0) {
        diagnostics.push(...composeDocumentDiagnostics(document.contents, source.length));
    }

    return diagnostics;
}

function yamlErrorDiagnostic(error: { pos: [number, number]; message: string; code: string }, severity: "error" | "warning", length: number): Diagnostic {
    const from = Math.min(error.pos[0], length);
    const to = Math.max(from, Math.min(error.pos[1], length));
    return {
        from,
        to,
        severity,
        source: "YAML",
        message: `${error.message} (${error.code})`,
    };
}

function indentationDiagnostics(source: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    let offset = 0;
    let blockScalarIndent: number | null = null;

    for (const line of source.split("\n")) {
        const trimmedLine = line.trim();
        const indentation = line.match(/^ */)?.[0].length ?? 0;

        if (blockScalarIndent !== null) {
            if (trimmedLine && indentation > blockScalarIndent) {
                offset += line.length + 1;
                continue;
            }
            blockScalarIndent = null;
        }

        if (trimmedLine && !trimmedLine.startsWith("#") && indentation % 2 !== 0) {
            diagnostics.push({
                from: Math.min(offset, source.length),
                to: Math.min(offset + Math.max(indentation, 1), source.length),
                severity: "warning",
                source: "Dockge YAML",
                message: "Indentation should use multiples of 2 spaces.",
            });
        }

        if (/:[ \t]*[>|][+-]?[0-9]?[ \t]*(?:#.*)?$/.test(line)) {
            blockScalarIndent = indentation;
        }
        offset += line.length + 1;
    }

    return diagnostics;
}

function composeDocumentDiagnostics(contents: unknown, sourceLength: number): Diagnostic[] {
    if (!isMap(contents)) {
        if (sourceLength === 0) {
            return [];
        }
        return [ diagnosticForNode(contents, sourceLength, "The Compose file root must be a mapping.", "error") ];
    }

    const diagnostics: Diagnostic[] = [];
    for (const pair of contents.items) {
        const key = pairKey(pair);
        if (!key) {
            continue;
        }

        if (!topLevelKeys.has(key) && !key.startsWith("x-")) {
            diagnostics.push(diagnosticForNode(pair.key, sourceLength, `Unknown top-level Compose property: ${key}`, "warning"));
        }

        if (mappingTopLevelKeys.has(key) && !isMap(pair.value) && !isAlias(pair.value)) {
            diagnostics.push(diagnosticForNode(pair.value ?? pair.key, sourceLength, `${key} must be a mapping. Check its indentation.`, "error"));
        }

        if (key === "services" && isMap(pair.value)) {
            for (const servicePair of pair.value.items) {
                if (!isMap(servicePair.value) && !isAlias(servicePair.value)) {
                    const serviceName = pairKey(servicePair) ?? "This service";
                    diagnostics.push(diagnosticForNode(
                        servicePair.value ?? servicePair.key,
                        sourceLength,
                        `Service ${serviceName} must be a mapping. Check its indentation.`,
                        "error"
                    ));
                }
            }
        }
    }

    return diagnostics;
}

function pairKey(pair: Pair): string | null {
    return isScalar(pair.key) && pair.key.value !== null && pair.key.value !== undefined ? String(pair.key.value) : null;
}

function diagnosticForNode(node: unknown, sourceLength: number, message: string, severity: "error" | "warning"): Diagnostic {
    const range = isNode(node) ? node.range : null;
    const from = Math.min(range?.[0] ?? 0, sourceLength);
    const rangeEnd = Math.min(range?.[1] ?? from, sourceLength);
    const to = Math.max(from, rangeEnd);
    return {
        from,
        to,
        severity,
        source: "Compose",
        message,
    };
}

export function composeCompletionSource(context: CompletionContext): CompletionResult | null {
    const currentLine = context.state.doc.lineAt(context.pos);
    const beforeCursor = currentLine.text.slice(0, context.pos - currentLine.from);
    const parentPath = yamlParentPath(context);
    const valueMatch = /^(\s*)([a-zA-Z0-9_-]+):\s*([a-zA-Z0-9_-]*)$/.exec(beforeCursor);

    if (valueMatch) {
        const propertyName = valueMatch[2];
        const values = valueCompletions[propertyName] ?? (booleanProperties.has(propertyName) ? [ "true", "false" ] : null);
        if (values) {
            return {
                from: context.pos - valueMatch[3].length,
                options: values.map(label => ({
                    label,
                    type: "enum",
                })),
                validFor: /^[a-zA-Z0-9_-]*$/,
            };
        }
    }

    const word = context.matchBefore(/[a-zA-Z0-9_-]*/);
    if (!word || (word.from === word.to && !context.explicit)) {
        return null;
    }

    const indentation = beforeCursor.match(/^ */)?.[0] ?? "";
    const properties = propertiesForPath(parentPath);
    if (properties.length === 0) {
        return null;
    }

    return {
        from: word.from,
        options: properties.map(item => propertyCompletion(item, indentation)),
        validFor: /^[a-zA-Z0-9_-]*$/,
    };
}

function yamlParentPath(context: CompletionContext): string[] {
    const currentLine = context.state.doc.lineAt(context.pos);
    const currentIndentation = currentLine.text.match(/^ */)?.[0].length ?? 0;
    const stack: Array<{ indentation: number; key: string }> = [];

    for (let lineNumber = 1; lineNumber < currentLine.number; lineNumber++) {
        const line = context.state.doc.line(lineNumber).text;
        const match = /^( *)([a-zA-Z0-9_.-]+):\s*(?:#.*)?$/.exec(line);
        if (!match) {
            continue;
        }

        const indentation = match[1].length;
        while (stack.length > 0 && stack[stack.length - 1].indentation >= indentation) {
            stack.pop();
        }
        stack.push({
            indentation,
            key: match[2],
        });
    }

    while (stack.length > 0 && stack[stack.length - 1].indentation >= currentIndentation) {
        stack.pop();
    }
    return stack.map(item => item.key);
}

function propertiesForPath(path: string[]): ComposeProperty[] {
    if (path.length === 0) {
        return topLevelProperties;
    }
    if (path[0] === "services") {
        if (path.length === 2) {
            return serviceProperties;
        }
        if (path.length >= 3) {
            return nestedProperties[path[2]] ?? [];
        }
        return [];
    }
    if (path[0] === "networks" && path.length === 2) {
        return networkProperties;
    }
    if (path[0] === "volumes" && path.length === 2) {
        return volumeProperties;
    }
    if ((path[0] === "configs" || path[0] === "secrets") && path.length === 2) {
        return configOrSecretProperties;
    }
    return [];
}

function propertyCompletion(item: ComposeProperty, indentation: string): Completion {
    let suffix = " ";
    if (item.kind === "mapping") {
        suffix = `\n${indentation}  `;
    } else if (item.kind === "sequence") {
        suffix = `\n${indentation}  - `;
    }

    return {
        label: item.label,
        type: "property",
        detail: item.detail,
        info: item.info,
        apply: `${item.label}:${suffix}`,
    };
}

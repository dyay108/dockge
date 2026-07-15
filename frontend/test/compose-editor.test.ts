import assert from "node:assert/strict";
import test from "node:test";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
    composeCompletionSource,
    getYamlDiagnostics,
    isComposeFile,
    isYamlFile,
} from "../src/compose-editor";

function completionLabels(source: string): string[] {
    const state = EditorState.create({
        doc: source,
    });
    const result = composeCompletionSource(new CompletionContext(state, source.length, true));
    return result?.options.map(option => option.label) ?? [];
}

test("detects Compose and YAML file names", () => {
    assert.equal(isComposeFile("compose.yml"), true);
    assert.equal(isComposeFile("docker-compose.yaml"), true);
    assert.equal(isComposeFile("config/compose.production.yml"), true);
    assert.equal(isComposeFile("config/application.yml"), false);
    assert.equal(isYamlFile("config/application.yml"), true);
});

test("suggests Compose keys based on the YAML path", () => {
    assert.ok(completionLabels("serv").includes("services"));
    assert.ok(completionLabels("services:\n  web:\n    im").includes("image"));
    assert.ok(completionLabels("services:\n  web:\n    healthcheck:\n      int").includes("interval"));
});

test("suggests common Compose property values", () => {
    const labels = completionLabels("services:\n  web:\n    restart: un");
    assert.ok(labels.includes("unless-stopped"));
    assert.ok(labels.includes("on-failure"));
});

test("reports YAML syntax, indentation, and Compose structure problems", () => {
    const indentationDiagnostics = getYamlDiagnostics("services:\n web:\n    image: nginx\n", true);
    assert.ok(indentationDiagnostics.some(item => item.message.includes("multiples of 2 spaces")));

    const composeDiagnostics = getYamlDiagnostics("services:\n  web:\n  image: nginx\n", true);
    assert.ok(composeDiagnostics.some(item => item.message.includes("Service web must be a mapping")));

    const syntaxDiagnostics = getYamlDiagnostics("services:\n\tweb:\n", true);
    assert.ok(syntaxDiagnostics.some(item => item.severity === "error"));
});

test("accepts a valid Compose document without diagnostics", () => {
    const diagnostics = getYamlDiagnostics("services:\n  web:\n    image: nginx:alpine\n", true);
    assert.deepEqual(diagnostics, []);
});

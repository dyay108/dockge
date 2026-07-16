<template>
    <section class="shadow-box big-padding mb-3 stack-file-browser">
        <div class="file-browser-header">
            <nav :aria-label="$t('currentDirectory')" class="file-breadcrumb">
                <button
                    class="breadcrumb-part" type="button" :aria-current="currentDirectory ? undefined : 'page'"
                    @click="openDirectory('')"
                >
                    <font-awesome-icon icon="folder-open" class="me-1" />
                    {{ stackName }}
                </button>
                <template v-for="breadcrumb in breadcrumbs" :key="breadcrumb.path">
                    <span class="breadcrumb-separator">/</span>
                    <button
                        class="breadcrumb-part" type="button"
                        :aria-current="breadcrumb.path === currentDirectory ? 'page' : undefined"
                        @click="openDirectory(breadcrumb.path)"
                    >
                        {{ breadcrumb.name }}
                    </button>
                </template>
            </nav>
            <button
                class="btn btn-primary btn-sm new-file-trigger" type="button"
                :disabled="creatingFile || loadingDirectory" :aria-expanded="showNewFileForm"
                aria-controls="new-stack-file-form"
                @click="startCreatingFile"
            >
                <font-awesome-icon icon="plus" class="me-1" />
                {{ $t("newFile") }}
            </button>
        </div>

        <form v-if="showNewFileForm" id="new-stack-file-form" class="new-file-form" @submit.prevent="createFile">
            <div class="new-file-heading">
                <span class="new-file-icon" aria-hidden="true">
                    <font-awesome-icon icon="file" />
                </span>
                <div class="new-file-copy">
                    <label class="new-file-title" for="new-stack-file-name">{{ $t("newFile") }}</label>
                    <small v-if="newFileName && !isValidNewFileName" id="new-file-help" class="text-danger">
                        {{ $t("invalidFileName") }}
                    </small>
                    <small v-else id="new-file-help" class="new-file-directory">
                        {{ $t("newFileDirectory", { directory: currentDirectory || stackName }) }}
                    </small>
                </div>
            </div>
            <div class="new-file-controls">
                <input
                    id="new-stack-file-name" ref="newFileNameInput" v-model="newFileName" class="form-control form-control-sm"
                    :class="{ 'is-invalid': newFileName && !isValidNewFileName }" type="text" maxlength="255"
                    autocomplete="off" :placeholder="$t('newFileName')" :disabled="creatingFile" aria-describedby="new-file-help"
                    :aria-invalid="newFileName && !isValidNewFileName ? 'true' : undefined"
                    @keydown.esc="cancelCreatingFile"
                />
                <div class="new-file-actions">
                    <button class="btn btn-primary btn-sm" type="submit" :disabled="!isValidNewFileName || creatingFile">
                        <font-awesome-icon v-if="creatingFile" icon="spinner" spin class="me-1" />
                        {{ $t("Create") }}
                    </button>
                    <button class="btn btn-normal btn-sm" type="button" :disabled="creatingFile" @click="cancelCreatingFile">
                        {{ $t("cancel") }}
                    </button>
                </div>
            </div>
        </form>

        <div class="row g-0 browser-content">
            <div class="col-md-4 col-lg-3 file-list-pane" :aria-busy="loadingDirectory">
                <div v-if="loadingDirectory" class="loading-state" role="status">
                    <font-awesome-icon icon="spinner" spin />
                    <span>{{ $t("loadingFiles") }}</span>
                </div>
                <div v-else class="file-list">
                    <button
                        v-if="currentDirectory" class="file-entry" type="button"
                        :aria-label="$t('parentDirectory')" @click="openDirectory(parentDirectory)"
                    >
                        <font-awesome-icon icon="folder" class="entry-icon" />
                        <span class="entry-name">..</span>
                    </button>

                    <button
                        v-for="entry in entries" :key="entry.path" class="file-entry"
                        :class="{ active: selectedFile?.path === entry.path }" type="button"
                        :aria-current="selectedFile?.path === entry.path ? 'page' : undefined"
                        :disabled="entry.type === 'symlink'" :title="entry.type === 'symlink' ? $t('symlinkNotEditable') : ''"
                        @click="openEntry(entry)"
                    >
                        <font-awesome-icon :icon="entry.type === 'directory' ? 'folder' : 'file'" class="entry-icon" />
                        <span class="entry-name">{{ entry.name }}</span>
                        <span v-if="entry.type === 'file'" class="entry-size">{{ formatFileSize(entry.size) }}</span>
                    </button>

                    <div v-if="entries.length === 0" class="empty-directory">
                        <span class="empty-state-icon" aria-hidden="true">
                            <font-awesome-icon icon="folder-open" />
                        </span>
                        <span>{{ $t("emptyDirectory") }}</span>
                    </div>
                </div>
            </div>

            <div class="col-md-8 col-lg-9 editor-pane" :aria-busy="loadingFile">
                <div v-if="loadingFile" class="loading-state editor-loading" role="status">
                    <font-awesome-icon icon="spinner" spin />
                    <span>{{ $t("loadingFile") }}</span>
                </div>
                <template v-else-if="selectedFile">
                    <div class="editor-toolbar">
                        <div class="selected-file-details">
                            <span class="selected-file-icon" aria-hidden="true">
                                <font-awesome-icon icon="file" />
                            </span>
                            <div class="selected-file-copy">
                                <strong :title="selectedFile.path">{{ selectedFile.path }}</strong>
                                <div class="selected-file-meta">
                                    <span>{{ formatFileSize(selectedFile.size) }}</span>
                                    <span v-if="isDirty" class="unsaved-status" role="status">
                                        <span class="unsaved-dot" aria-hidden="true"></span>
                                        {{ $t("unsavedChanges") }}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="editor-actions">
                            <button
                                class="btn btn-normal btn-sm editor-action editor-action-secondary" type="button"
                                :disabled="saving" :aria-label="$t('findReplace')" :title="$t('findReplace')" @click="openFindReplace"
                            >
                                <font-awesome-icon icon="search" class="action-icon me-1" />
                                <span class="action-label">{{ $t("findReplace") }}</span>
                            </button>
                            <button
                                class="btn btn-normal btn-sm editor-action editor-action-secondary" type="button"
                                :disabled="saving" :aria-label="$t('reloadFile')" :title="$t('reloadFile')" @click="reloadFile"
                            >
                                <font-awesome-icon icon="rotate" class="action-icon me-1" />
                                <span class="action-label">{{ $t("reloadFile") }}</span>
                            </button>
                            <button
                                class="btn btn-primary btn-sm editor-action save-action" type="button"
                                :disabled="!isDirty || saving" @click="saveFile"
                            >
                                <font-awesome-icon v-if="saving" icon="spinner" spin class="me-1" />
                                <font-awesome-icon v-else icon="save" class="me-1" />
                                {{ $t("Save") }}
                            </button>
                        </div>
                    </div>
                    <div class="file-editor">
                        <code-mirror
                            ref="fileEditor" v-model="fileContent" :extensions="editorExtensions" minimal wrap="true" dark="true" tab="true"
                            :disabled="saving"
                        />
                    </div>
                </template>
                <div v-else class="empty-editor">
                    <span class="empty-state-icon empty-editor-icon" aria-hidden="true">
                        <font-awesome-icon icon="file" />
                    </span>
                    <strong>{{ $t("selectFileToEdit") }}</strong>
                </div>
            </div>
        </div>
    </section>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { lineNumbers } from "@codemirror/view";
import { dracula as editorTheme } from "thememirror";
import { createFileEditorExtensions, openEditorSearch } from "../compose-editor";

export default {
    name: "StackFileBrowser",
    components: {
        CodeMirror,
    },
    props: {
        stackName: {
            type: String,
            required: true,
        },
        endpoint: {
            type: String,
            default: "",
        },
    },
    emits: [ "dirty-change", "saved" ],
    data() {
        return {
            currentDirectory: "",
            entries: [],
            selectedFile: null,
            fileContent: "",
            originalContent: "",
            loadingDirectory: false,
            loadingFile: false,
            saving: false,
            showNewFileForm: false,
            newFileName: "",
            creatingFile: false,
        };
    },
    computed: {
        editorExtensions() {
            return [
                editorTheme,
                lineNumbers(),
                ...createFileEditorExtensions(this.selectedFile?.path ?? ""),
            ];
        },
        isDirty() {
            return this.selectedFile !== null && this.fileContent !== this.originalContent;
        },
        breadcrumbs() {
            let currentPath = "";
            return this.currentDirectory.split("/").filter(Boolean).map(name => {
                currentPath = currentPath ? `${currentPath}/${name}` : name;
                return {
                    name,
                    path: currentPath,
                };
            });
        },
        parentDirectory() {
            const separatorIndex = this.currentDirectory.lastIndexOf("/");
            return separatorIndex === -1 ? "" : this.currentDirectory.slice(0, separatorIndex);
        },
        trimmedNewFileName() {
            return this.newFileName.trim();
        },
        isValidNewFileName() {
            const fileName = this.trimmedNewFileName;
            return fileName.length > 0
                && fileName.length <= 255
                && fileName !== "."
                && fileName !== ".."
                && !/[\\/]/.test(fileName)
                && !Array.from(fileName).some(character => {
                    const characterCode = character.charCodeAt(0);
                    return characterCode < 32 || characterCode === 127;
                });
        },
        newFilePath() {
            return this.currentDirectory
                ? `${this.currentDirectory}/${this.trimmedNewFileName}`
                : this.trimmedNewFileName;
        },
    },
    watch: {
        isDirty(isDirty) {
            this.$emit("dirty-change", isDirty);
        },
    },
    mounted() {
        this.loadDirectory("");
    },
    methods: {
        openEntry(entry) {
            if (entry.type === "directory") {
                this.openDirectory(entry.path);
            } else if (entry.type === "file") {
                this.loadFile(entry.path);
            }
        },

        openDirectory(relativePath) {
            if (!this.confirmDiscardChanges()) {
                return;
            }
            this.cancelCreatingFile();
            this.selectedFile = null;
            this.fileContent = "";
            this.originalContent = "";
            this.loadDirectory(relativePath);
        },

        loadDirectory(relativePath) {
            this.loadingDirectory = true;
            this.$root.emitAgent(this.endpoint, "listStackFiles", this.stackName, relativePath, (res) => {
                this.loadingDirectory = false;
                if (res.ok) {
                    this.currentDirectory = this.toBrowserPath(res.path);
                    this.entries = res.entries.map(entry => ({
                        ...entry,
                        path: this.toBrowserPath(entry.path),
                    }));
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        loadFile(relativePath, discardConfirmed = false) {
            if (!discardConfirmed && !this.confirmDiscardChanges()) {
                return;
            }
            this.cancelCreatingFile();
            this.loadingFile = true;
            this.$root.emitAgent(this.endpoint, "readStackFile", this.stackName, relativePath, (res) => {
                this.loadingFile = false;
                if (res.ok) {
                    this.selectedFile = {
                        ...res.file,
                        path: this.toBrowserPath(res.file.path),
                    };
                    this.originalContent = res.file.content;
                    this.fileContent = res.file.content;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        reloadFile() {
            if (!this.selectedFile || !this.confirmDiscardChanges()) {
                return;
            }
            this.loadFile(this.selectedFile.path, true);
        },

        saveFile() {
            if (!this.selectedFile || !this.isDirty) {
                return;
            }

            this.saving = true;
            this.$root.emitAgent(
                this.endpoint,
                "writeStackFile",
                this.stackName,
                this.selectedFile.path,
                this.fileContent,
                this.selectedFile.version,
                (res) => {
                    this.saving = false;
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.selectedFile = {
                            ...res.file,
                            path: this.toBrowserPath(res.file.path),
                        };
                        this.originalContent = res.file.content;
                        this.fileContent = res.file.content;
                        this.$emit("saved", this.selectedFile.path);
                        this.loadDirectory(this.currentDirectory);
                    }
                }
            );
        },

        startCreatingFile() {
            if (this.showNewFileForm) {
                this.$refs.newFileNameInput?.focus();
                return;
            }
            this.showNewFileForm = true;
            this.newFileName = "";
            this.$nextTick(() => this.$refs.newFileNameInput?.focus());
        },

        cancelCreatingFile() {
            if (this.creatingFile) {
                return;
            }
            this.showNewFileForm = false;
            this.newFileName = "";
        },

        createFile() {
            if (!this.isValidNewFileName || this.creatingFile || !this.confirmDiscardChanges()) {
                return;
            }

            this.creatingFile = true;
            this.$root.emitAgent(this.endpoint, "createStackFile", this.stackName, this.newFilePath, (res) => {
                this.creatingFile = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.selectedFile = {
                        ...res.file,
                        path: this.toBrowserPath(res.file.path),
                    };
                    this.originalContent = res.file.content;
                    this.fileContent = res.file.content;
                    this.showNewFileForm = false;
                    this.newFileName = "";
                    this.$emit("saved", this.selectedFile.path);
                    this.loadDirectory(this.currentDirectory);
                    this.$nextTick(() => {
                        const editor = this.$refs.fileEditor;
                        (editor?.view?.value ?? editor?.view)?.focus();
                    });
                }
            });
        },

        openFindReplace() {
            const editor = this.$refs.fileEditor;
            openEditorSearch(editor?.view?.value ?? editor?.view);
        },

        confirmDiscardChanges() {
            return !this.isDirty || confirm(this.$t("discardFileChanges"));
        },

        toBrowserPath(relativePath) {
            return relativePath.replaceAll("\\", "/");
        },

        formatFileSize(size) {
            if (size === null || size === undefined) {
                return "";
            }
            if (size < 1024) {
                return `${size} B`;
            }
            return `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KiB`;
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.stack-file-browser.shadow-box.big-padding {
    container-type: inline-size;
    overflow: hidden;
    padding: 16px;
}

.file-browser-header {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: space-between;
    margin-bottom: 14px;
}

.file-breadcrumb {
    align-items: center;
    display: flex;
    flex: 1 1 240px;
    min-height: 38px;
    min-width: 0;
    overflow-x: auto;
    white-space: nowrap;
}

.breadcrumb-part {
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: 20px;
    color: inherit;
    min-height: 34px;
    padding: 6px 8px;
    transition: background-color 0.15s ease, color 0.15s ease;

    &:hover {
        background-color: rgba($primary, 0.12);
        color: darken($primary, 24%);
    }

    &:focus-visible {
        outline: 2px solid $primary;
        outline-offset: -2px;
    }

    &[aria-current="page"] {
        font-weight: 600;
    }

    .dark & {
        &:hover {
            color: $primary;
        }
    }
}

.breadcrumb-separator {
    color: $dark-font-color3;
    padding: 0 2px;
}

.new-file-trigger {
    flex: 0 0 auto;
    min-height: 38px;
    padding: 6px 16px;
}

.new-file-form {
    background-color: #f7f9fb;
    border: 1px solid #dee2e6;
    border-radius: 10px;
    margin-bottom: 14px;
    padding: 12px;

    .dark & {
        background-color: $dark-header-bg;
        border-color: $dark-border-color;
    }
}

.new-file-heading {
    align-items: center;
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
    min-width: 0;
}

.new-file-icon,
.selected-file-icon,
.empty-state-icon {
    align-items: center;
    background-color: rgba($primary, 0.18);
    border-radius: 50%;
    color: darken($primary, 28%);
    display: inline-flex;
    flex: 0 0 auto;
    justify-content: center;

    .dark & {
        color: $primary;
    }
}

.new-file-icon {
    height: 34px;
    width: 34px;
}

.new-file-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.new-file-title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
}

.new-file-directory {
    color: #6c757d;

    .dark & {
        color: $dark-font-color;
    }
}

.new-file-controls {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .form-control {
        flex: 1 1 180px;
        min-height: 38px;
        min-width: 0;

        &::placeholder {
            color: #6c757d;
            opacity: 1;
        }

        .dark &::placeholder {
            color: rgba($dark-font-color, 0.68);
        }
    }
}

.new-file-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;

    .btn {
        min-height: 38px;
        padding: 6px 14px;
    }

    .btn-primary:disabled {
        filter: saturate(0.25);
        opacity: 0.45;
    }

    .dark & .btn-normal {
        background-color: $dark-bg2;
        border-color: $dark-border-color;

        &:hover {
            background-color: lighten($dark-bg2, 3%);
        }
    }
}

.browser-content {
    border: 1px solid #dee2e6;
    border-radius: 10px;
    min-height: 430px;
    overflow: hidden;

    .dark & {
        background-color: $dark-bg2;
        border-color: $dark-border-color;
    }
}

.file-list-pane {
    background-color: #fbfcfd;
    border-right: 1px solid #dee2e6;
    max-height: 70vh;
    overflow-y: auto;

    .dark & {
        background-color: #0b0f15;
        border-color: $dark-border-color;
    }
}

.loading-state {
    align-items: center;
    color: #6c757d;
    display: flex;
    flex-direction: column;
    gap: 9px;
    justify-content: center;
    min-height: 116px;
    padding: 24px;

    .dark & {
        color: $dark-font-color;
    }
}

.editor-loading {
    flex: 1 1 auto;
}

.file-entry {
    align-items: center;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #eef0f2;
    color: inherit;
    display: flex;
    gap: 9px;
    min-height: 48px;
    padding: 9px 12px;
    position: relative;
    text-align: left;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
    width: 100%;

    &:hover:not(:disabled) {
        background-color: rgba($primary, 0.1);
    }

    &.active {
        background-color: rgba($primary, 0.18);
        box-shadow: inset 3px 0 $primary;
        font-weight: 600;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    &:focus-visible {
        outline: 2px solid $primary;
        outline-offset: -2px;
        z-index: 1;
    }

    .dark & {
        border-color: $dark-border-color;

        &:hover:not(:disabled) {
            background-color: rgba($primary, 0.08);
        }

        &.active {
            background-color: rgba($primary, 0.14);
        }
    }
}

.entry-icon {
    color: $primary;
    flex: 0 0 16px;
}

.entry-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.entry-size {
    color: $dark-font-color3;
    flex: 0 0 auto;
    font-size: 12px;
}

.empty-directory {
    align-items: center;
    color: #6c757d;
    display: flex;
    flex-direction: column;
    gap: 10px;
    justify-content: center;
    min-height: 126px;
    padding: 24px;
    text-align: center;

    .dark & {
        color: $dark-font-color;
    }
}

.editor-pane {
    display: flex;
    flex-direction: column;
    min-height: 430px;
    min-width: 0;
}

.editor-toolbar {
    align-items: center;
    background-color: #fff;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    min-height: 68px;
    padding: 12px;

    .dark & {
        background-color: $dark-header-bg;
        border-color: $dark-border-color;
    }
}

.selected-file-details {
    align-items: center;
    display: flex;
    flex: 1 1 auto;
    gap: 10px;
    min-width: 0;
}

.selected-file-icon {
    border-radius: 8px;
    height: 36px;
    width: 36px;
}

.selected-file-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;

    strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.selected-file-meta {
    align-items: center;
    color: #6c757d;
    display: flex;
    flex-wrap: wrap;
    font-size: 12px;
    gap: 8px;
    min-height: 18px;

    .dark & {
        color: $dark-font-color;
    }
}

.unsaved-status {
    align-items: center;
    color: darken($warning, 12%);
    display: inline-flex;
    font-weight: 600;
    gap: 5px;

    .dark & {
        color: $warning;
    }
}

.unsaved-dot {
    background-color: currentColor;
    border-radius: 50%;
    height: 6px;
    width: 6px;
}

.editor-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
}

.editor-action {
    min-height: 38px;
    padding: 6px 12px;
    white-space: nowrap;

    .dark &.btn-normal {
        background-color: $dark-bg2;
        border-color: $dark-border-color;

        &:hover {
            background-color: lighten($dark-bg2, 3%);
        }
    }
}

.save-action:disabled {
    filter: saturate(0.25);
    opacity: 0.45;
}

.file-editor {
    background-color: #282a36;
    flex: 1 1 auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    min-height: 370px;
    overflow: hidden;

    :deep(.cm-editor) {
        height: 100%;
        min-height: 370px;
    }

    :deep(.cm-scroller) {
        max-height: 70vh;
        overflow: auto;
    }

    :deep(.cm-content[contenteditable="true"]) {
        background-color: transparent;
        border-radius: 0;

        &:focus,
        &:hover {
            background-color: transparent;
        }
    }
}

.empty-editor {
    align-items: center;
    background-color: #fbfcfd;
    color: #6c757d;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
    padding: 40px;
    text-align: center;

    .dark & {
        background-color: $dark-bg2;
        color: $dark-font-color;
    }
}

.empty-state-icon {
    height: 42px;
    width: 42px;
}

.empty-editor-icon {
    height: 52px;
    width: 52px;
}

@container (max-width: 620px) {
    .browser-content {
        display: block;
        min-height: 0;
    }

    .file-list-pane,
    .editor-pane {
        width: 100%;
    }

    .file-list-pane {
        border-bottom: 1px solid #dee2e6;
        border-right: 0;
        max-height: 240px;

        .dark & {
            border-color: $dark-border-color;
        }
    }

    .editor-pane {
        min-height: 360px;
    }

    .editor-toolbar {
        align-items: stretch;
        flex-direction: column;
    }

    .editor-actions {
        width: 100%;
    }

    .file-editor,
    .file-editor :deep(.cm-editor) {
        min-height: 300px;
    }
}

@container (max-width: 400px) {
    .stack-file-browser.shadow-box.big-padding {
        padding: 12px;
    }

    .file-browser-header {
        gap: 8px;
        margin-bottom: 12px;
    }

    .file-breadcrumb {
        flex-basis: 180px;
    }

    .new-file-trigger {
        padding-left: 12px;
        padding-right: 12px;
    }

    .new-file-controls .form-control {
        flex-basis: 100%;
    }

    .new-file-actions {
        width: 100%;

        .btn {
            flex: 1 1 0;
        }
    }

    .file-list-pane {
        max-height: 220px;
    }

    .editor-pane {
        min-height: 340px;
    }

    .editor-toolbar {
        padding: 12px;
    }

    .editor-actions {
        display: grid;
        grid-template-columns: 44px 44px minmax(88px, 1fr);
    }

    .editor-action {
        justify-content: center;
        padding-left: 9px;
        padding-right: 9px;
    }

    .editor-action-secondary {
        .action-icon {
            margin-right: 0 !important;
        }

        .action-label {
            display: none;
        }
    }

    .file-editor,
    .file-editor :deep(.cm-editor) {
        min-height: 280px;
    }
}
</style>

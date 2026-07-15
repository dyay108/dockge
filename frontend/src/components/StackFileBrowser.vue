<template>
    <section class="shadow-box big-padding mb-3 stack-file-browser">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h4 class="mb-0">{{ $t("stackFiles") }}</h4>
            <span class="text-muted small">{{ stackName }}</span>
        </div>

        <nav :aria-label="$t('currentDirectory')" class="file-breadcrumb mb-3">
            <button class="breadcrumb-part" type="button" @click="openDirectory('')">
                <font-awesome-icon icon="folder-open" class="me-1" />
                {{ stackName }}
            </button>
            <template v-for="breadcrumb in breadcrumbs" :key="breadcrumb.path">
                <span class="breadcrumb-separator">/</span>
                <button class="breadcrumb-part" type="button" @click="openDirectory(breadcrumb.path)">
                    {{ breadcrumb.name }}
                </button>
            </template>
        </nav>

        <div class="row g-0 browser-content">
            <div class="col-md-4 col-lg-3 file-list-pane">
                <div v-if="loadingDirectory" class="text-center p-4">
                    <font-awesome-icon icon="spinner" spin />
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
                        :disabled="entry.type === 'symlink'" :title="entry.type === 'symlink' ? $t('symlinkNotEditable') : ''"
                        @click="openEntry(entry)"
                    >
                        <font-awesome-icon :icon="entry.type === 'directory' ? 'folder' : 'file'" class="entry-icon" />
                        <span class="entry-name">{{ entry.name }}</span>
                        <span v-if="entry.type === 'file'" class="entry-size">{{ formatFileSize(entry.size) }}</span>
                    </button>

                    <div v-if="entries.length === 0" class="text-center text-muted p-4">
                        {{ $t("emptyDirectory") }}
                    </div>
                </div>
            </div>

            <div class="col-md-8 col-lg-9 editor-pane">
                <div v-if="loadingFile" class="text-center p-5">
                    <font-awesome-icon icon="spinner" spin />
                </div>
                <template v-else-if="selectedFile">
                    <div class="editor-toolbar">
                        <div class="selected-file-details">
                            <strong>{{ selectedFile.path }}</strong>
                            <span class="text-muted small">{{ formatFileSize(selectedFile.size) }}</span>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-normal btn-sm" type="button" :disabled="saving" @click="reloadFile">
                                {{ $t("reloadFile") }}
                            </button>
                            <button class="btn btn-primary btn-sm" type="button" :disabled="!isDirty || saving" @click="saveFile">
                                <font-awesome-icon v-if="saving" icon="spinner" spin class="me-1" />
                                <font-awesome-icon v-else icon="save" class="me-1" />
                                {{ $t("Save") }}
                            </button>
                        </div>
                    </div>
                    <div class="file-editor">
                        <code-mirror
                            v-model="fileContent" :extensions="extensions" minimal wrap="true" dark="true" tab="true"
                            :disabled="saving"
                        />
                    </div>
                </template>
                <div v-else class="empty-editor text-muted">
                    <font-awesome-icon icon="file" size="2x" class="mb-3" />
                    <span>{{ $t("selectFileToEdit") }}</span>
                </div>
            </div>
        </div>
    </section>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { lineNumbers } from "@codemirror/view";
import { dracula as editorTheme } from "thememirror";

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
    setup() {
        return {
            extensions: [ editorTheme, lineNumbers() ],
        };
    },
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
        };
    },
    computed: {
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

.stack-file-browser {
    overflow: hidden;
}

.file-breadcrumb {
    display: flex;
    align-items: center;
    min-height: 24px;
    overflow-x: auto;
    white-space: nowrap;
}

.breadcrumb-part {
    appearance: none;
    background: transparent;
    border: 0;
    color: inherit;
    padding: 0;

    &:hover {
        color: $primary;
    }
}

.breadcrumb-separator {
    color: $dark-font-color3;
    padding: 0 8px;
}

.browser-content {
    border: 1px solid #dee2e6;
    border-radius: 10px;
    min-height: 430px;
    overflow: hidden;

    .dark & {
        border-color: $dark-border-color;
    }
}

.file-list-pane {
    border-right: 1px solid #dee2e6;
    max-height: 70vh;
    overflow-y: auto;

    .dark & {
        border-color: $dark-border-color;
    }
}

.file-entry {
    align-items: center;
    background: transparent;
    border: 0;
    border-bottom: 1px solid #eef0f2;
    color: inherit;
    display: flex;
    gap: 9px;
    min-height: 44px;
    padding: 8px 12px;
    text-align: left;
    width: 100%;

    &:hover:not(:disabled),
    &.active {
        background-color: $highlight-white;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .dark & {
        border-color: $dark-border-color;

        &:hover:not(:disabled),
        &.active {
            background-color: $dark-bg2;
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

.editor-pane {
    display: flex;
    flex-direction: column;
    min-height: 430px;
    min-width: 0;
}

.editor-toolbar {
    align-items: center;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    min-height: 58px;
    padding: 10px 12px;

    .dark & {
        border-color: $dark-border-color;
    }
}

.selected-file-details {
    display: flex;
    flex-direction: column;
    min-width: 0;

    strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
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
}

.empty-editor {
    align-items: center;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: center;
    padding: 40px;
    text-align: center;
}

@media (max-width: 767px) {
    .file-list-pane {
        border-bottom: 1px solid #dee2e6;
        border-right: 0;
        max-height: 260px;

        .dark & {
            border-color: $dark-border-color;
        }
    }

    .editor-toolbar {
        align-items: flex-start;
        flex-direction: column;
    }
}
</style>

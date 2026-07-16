<template>
    <div class="container-shell">
        <div class="shell-header">
            <div class="shell-info">
                <span
                    class="status-dot"
                    :class="{ connected: connected }"
                    :title="connected ? $t('connected') : $t('connecting')"
                ></span>
                <font-awesome-icon icon="terminal" class="shell-icon" />
                <span class="service-name">{{ serviceName }}</span>
                <span v-if="stackName" class="stack-name d-none d-sm-inline">{{ stackName }}</span>
            </div>
            <div class="shell-actions" role="group" aria-label="Shell">
                <button
                    v-for="shellOption in shellOptions"
                    :key="shellOption"
                    type="button"
                    class="shell-switch"
                    :class="{ active: shell === shellOption }"
                    :aria-pressed="shell === shellOption"
                    @click="switchShell(shellOption)"
                >
                    {{ shellOption }}
                </button>
            </div>
        </div>
        <Terminal
            :key="terminalName + '-' + shell"
            ref="terminal"
            class="terminal shell-terminal"
            :rows="20"
            mode="interactive"
            :name="terminalName"
            :stack-name="stackName"
            :service-name="serviceName"
            :shell="shell"
            :endpoint="endpoint"
            @has-data="connected = true"
        ></Terminal>
    </div>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { getContainerExecTerminalName } from "../../../common/util-common";
import Terminal from "./Terminal.vue";

export default {
    components: {
        FontAwesomeIcon,
        Terminal,
    },
    props: {
        stackName: {
            type: String,
            required: true,
        },
        serviceName: {
            type: String,
            required: true,
        },
        endpoint: {
            type: String,
            default: "",
        },
        shell: {
            type: String,
            default: "bash",
        },
    },
    emits: [ "update:shell" ],
    data() {
        return {
            connected: false,
            shellOptions: [ "bash", "sh" ],
        };
    },
    computed: {
        terminalName() {
            return getContainerExecTerminalName(this.endpoint, this.stackName, this.serviceName, 0);
        },
    },
    watch: {
        // A new terminal session is created when the shell or the target
        // container changes, show "connecting" until it outputs something
        shell() {
            this.connected = false;
        },
        terminalName() {
            this.connected = false;
        },
    },
    methods: {
        switchShell(shell) {
            if (shell !== this.shell) {
                this.$emit("update:shell", shell);
            }
        },

        updateTerminalSize() {
            this.$refs.terminal?.updateTerminalSize();
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars";

.container-shell {
    border-radius: 10px;
    box-shadow: 0 15px 70px rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

// The terminal body is always black, so the header stays dark in both themes
.shell-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    padding: 10px 16px;
    background-color: $dark-header-bg;
    border-bottom: 1px solid $dark-border-color;
    border-radius: 10px 10px 0 0;
}

.shell-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: $dark-font-color;

    .shell-icon {
        flex-shrink: 0;
        font-size: 12px;
        opacity: 0.7;
    }

    .service-name {
        font-family: "JetBrains Mono", monospace;
        font-weight: 600;
        color: #f0f6fc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .stack-name {
        font-size: 13px;
        color: $dark-font-color3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.status-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: $dark-font-color3;
    transition: background-color 0.3s $easing-in;

    &.connected {
        background-color: #86e6a9;
        box-shadow: 0 0 5px #86e6a9;
    }
}

.shell-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
}

.shell-switch {
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    line-height: 1;
    padding: 6px 14px;
    border-radius: 25px;
    border: 1px solid $dark-border-color;
    background-color: transparent;
    color: $dark-font-color;
    transition: all ease-in-out 0.15s;

    &:hover {
        background-color: $dark-bg2;
    }

    &.active {
        background: $primary-gradient;
        border-color: transparent;
        color: $dark-font-color2;
        font-weight: 600;
    }
}

.shell-terminal {
    border-radius: 0 0 10px 10px;
    box-shadow: none;
    height: calc(100vh - 340px);
    height: calc(100dvh - 340px);
    min-height: 280px;
    max-height: 700px;
}

@media (max-width: 770px) {
    .shell-header {
        padding: 8px 12px;
    }

    // Leave room for the mobile bottom nav; dvh shrinks with the soft
    // keyboard so the prompt stays visible while typing
    .shell-terminal {
        height: calc(100vh - 300px);
        height: calc(100dvh - 300px);
        min-height: 220px;
    }
}
</style>

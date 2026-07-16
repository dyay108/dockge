<template>
    <transition name="slide-fade" appear>
        <div>
            <div class="mb-3">
                <router-link :to="stackRoute" class="btn btn-normal btn-sm">
                    <font-awesome-icon icon="arrow-left" class="me-1" />
                    {{ stackName }}
                </router-link>
            </div>

            <h1 class="mb-3">{{ $t("terminal") }}</h1>

            <ContainerShell
                :stack-name="stackName"
                :service-name="serviceName"
                :endpoint="endpoint"
                :shell="shell"
                @update:shell="switchShell"
            />
        </div>
    </transition>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import ContainerShell from "../components/ContainerShell.vue";

export default {
    components: {
        ContainerShell,
        FontAwesomeIcon,
    },
    computed: {
        stackName() {
            return this.$route.params.stackName;
        },
        endpoint() {
            return this.$route.params.endpoint || "";
        },
        shell() {
            return this.$route.params.type;
        },
        serviceName() {
            return this.$route.params.serviceName;
        },
        stackRoute() {
            if (this.endpoint) {
                return `/compose/${this.stackName}/${this.endpoint}`;
            }
            return `/compose/${this.stackName}`;
        },
    },
    methods: {
        switchShell(shell) {
            let data = {
                name: "containerTerminal",
                params: {
                    stackName: this.stackName,
                    serviceName: this.serviceName,
                    type: shell,
                },
            };

            if (this.endpoint) {
                data.name = "containerTerminalEndpoint";
                data.params.endpoint = this.endpoint;
            }

            this.$router.replace(data);
        },
    }
};
</script>

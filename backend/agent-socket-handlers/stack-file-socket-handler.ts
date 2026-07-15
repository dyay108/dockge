import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { Stack } from "../stack";
import { StackFileManager } from "../stack-file-manager";
import { AgentSocket } from "../../common/agent-socket";

export class StackFileSocketHandler extends AgentSocketHandler {
    create(socket: DockgeSocket, server: DockgeServer, agentSocket: AgentSocket) {
        agentSocket.on("listStackFiles", async (stackName: unknown, relativePath: unknown, callback) => {
            try {
                checkLogin(socket);
                const manager = await this.getFileManager(server, stackName);
                const result = await manager.listDirectory(this.validatePath(relativePath));
                callbackResult({
                    ok: true,
                    ...result,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("readStackFile", async (stackName: unknown, relativePath: unknown, callback) => {
            try {
                checkLogin(socket);
                const manager = await this.getFileManager(server, stackName);
                const file = await manager.readFile(this.validatePath(relativePath));
                callbackResult({
                    ok: true,
                    file,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("createStackFile", async (stackName: unknown, relativePath: unknown, callback) => {
            try {
                checkLogin(socket);
                const manager = await this.getFileManager(server, stackName);
                const file = await manager.createFile(this.validatePath(relativePath));
                callbackResult({
                    ok: true,
                    msg: "Created",
                    msgi18n: true,
                    file,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("writeStackFile", async (stackName: unknown, relativePath: unknown, content: unknown, version: unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof content !== "string" || typeof version !== "string") {
                    throw new ValidationError("Invalid file content or version.");
                }

                const manager = await this.getFileManager(server, stackName);
                const file = await manager.writeFile(this.validatePath(relativePath), content, version);
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                    file,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    private async getFileManager(server: DockgeServer, stackName: unknown): Promise<StackFileManager> {
        if (typeof stackName !== "string" || !stackName.match(/^[a-z0-9_-]+$/)) {
            throw new ValidationError("Invalid stack name.");
        }

        const stack = await Stack.getStack(server, stackName);
        if (!stack.isManagedByDockge) {
            throw new ValidationError("Files are only available for stacks managed by Dockge.");
        }
        return new StackFileManager(stack.fullPath);
    }

    private validatePath(relativePath: unknown): string {
        if (typeof relativePath !== "string") {
            throw new ValidationError("File path must be a string.");
        }
        return relativePath;
    }
}

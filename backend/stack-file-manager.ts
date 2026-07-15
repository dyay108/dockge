import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { ValidationError } from "./util-server";

export const MAX_STACK_FILE_SIZE = 1024 * 1024;

export type StackFileEntryType = "directory" | "file" | "symlink";

export interface StackFileEntry {
    name: string;
    path: string;
    type: StackFileEntryType;
    size: number | null;
    modifiedAt: string | null;
}

export interface StackFileContent {
    path: string;
    content: string;
    size: number;
    modifiedAt: string;
    version: string;
}

interface ResolvedStackPath {
    targetPath: string;
    stat: Stats;
}

export class StackFileManager {
    constructor(private readonly stackPath: string) {
    }

    async listDirectory(relativePath: string): Promise<{ path: string; entries: StackFileEntry[] }> {
        const resolvedPath = await this.resolveExistingPath(relativePath);
        if (!resolvedPath.stat.isDirectory()) {
            throw new ValidationError("The requested path is not a directory.");
        }

        const directoryEntries = await fs.readdir(resolvedPath.targetPath, {
            withFileTypes: true,
        });
        const entries: StackFileEntry[] = [];

        for (const directoryEntry of directoryEntries) {
            const entryPath = this.joinRelativePath(relativePath, directoryEntry.name);
            const fullEntryPath = path.join(resolvedPath.targetPath, directoryEntry.name);

            if (directoryEntry.isSymbolicLink()) {
                entries.push({
                    name: directoryEntry.name,
                    path: entryPath,
                    type: "symlink",
                    size: null,
                    modifiedAt: null,
                });
            } else if (directoryEntry.isDirectory()) {
                entries.push({
                    name: directoryEntry.name,
                    path: entryPath,
                    type: "directory",
                    size: null,
                    modifiedAt: null,
                });
            } else if (directoryEntry.isFile()) {
                const stat = await fs.stat(fullEntryPath);
                entries.push({
                    name: directoryEntry.name,
                    path: entryPath,
                    type: "file",
                    size: stat.size,
                    modifiedAt: stat.mtime.toISOString(),
                });
            }
        }

        entries.sort((a, b) => {
            const typeOrder: Record<StackFileEntryType, number> = {
                directory: 0,
                file: 1,
                symlink: 2,
            };
            const typeDifference = typeOrder[a.type] - typeOrder[b.type];
            if (typeDifference !== 0) {
                return typeDifference;
            }
            return a.name.localeCompare(b.name, undefined, {
                sensitivity: "base",
                numeric: true,
            });
        });

        return {
            path: this.normalizeRelativePath(relativePath),
            entries,
        };
    }

    async readFile(relativePath: string): Promise<StackFileContent> {
        const resolvedPath = await this.resolveEditableFile(relativePath);
        const file = await this.readTextContent(resolvedPath.targetPath);

        return this.fileContentResult(relativePath, file.content, resolvedPath.stat, this.fileVersion(file.buffer));
    }

    async writeFile(relativePath: string, content: string, expectedVersion: string): Promise<StackFileContent> {
        if (typeof content !== "string") {
            throw new ValidationError("File content must be a string.");
        }
        if (Buffer.byteLength(content, "utf8") > MAX_STACK_FILE_SIZE) {
            throw new ValidationError("The edited file is larger than 1 MiB.");
        }

        const resolvedPath = await this.resolveEditableFile(relativePath);
        const existingFile = await this.readTextContent(resolvedPath.targetPath);
        if (this.fileVersion(existingFile.buffer) !== expectedVersion) {
            throw new ValidationError("This file changed on disk. Reload it before saving.");
        }

        await fs.writeFile(resolvedPath.targetPath, content, "utf8");

        const stat = await fs.stat(resolvedPath.targetPath);
        return this.fileContentResult(relativePath, content, stat, this.fileVersion(Buffer.from(content, "utf8")));
    }

    private async resolveEditableFile(relativePath: string): Promise<ResolvedStackPath> {
        const resolvedPath = await this.resolveExistingPath(relativePath);
        if (!resolvedPath.stat.isFile()) {
            throw new ValidationError("The requested path is not a regular file.");
        }
        if (resolvedPath.stat.size > MAX_STACK_FILE_SIZE) {
            throw new ValidationError("Files larger than 1 MiB cannot be edited.");
        }
        return resolvedPath;
    }

    private async resolveExistingPath(relativePath: string): Promise<ResolvedStackPath> {
        const normalizedPath = this.normalizeRelativePath(relativePath);
        const rootPath = await fs.realpath(this.stackPath);
        const candidatePath = path.resolve(rootPath, normalizedPath || ".");
        this.assertContainedPath(rootPath, candidatePath);

        const linkStat = await fs.lstat(candidatePath);
        if (linkStat.isSymbolicLink()) {
            throw new ValidationError("Symbolic links cannot be opened.");
        }

        const targetPath = await fs.realpath(candidatePath);
        this.assertContainedPath(rootPath, targetPath);

        return {
            targetPath,
            stat: await fs.stat(targetPath),
        };
    }

    private normalizeRelativePath(relativePath: string): string {
        if (typeof relativePath !== "string") {
            throw new ValidationError("File path must be a string.");
        }
        if (relativePath.includes("\0") || relativePath.length > 4096 || path.isAbsolute(relativePath)) {
            throw new ValidationError("Invalid file path.");
        }

        const normalizedPath = path.normalize(relativePath || ".");
        return normalizedPath === "." ? "" : normalizedPath;
    }

    private assertContainedPath(rootPath: string, targetPath: string) {
        const relativePath = path.relative(rootPath, targetPath);
        if (relativePath === ".." || relativePath.startsWith(".." + path.sep) || path.isAbsolute(relativePath)) {
            throw new ValidationError("The requested path is outside this stack.");
        }
    }

    private joinRelativePath(relativePath: string, name: string): string {
        const normalizedPath = this.normalizeRelativePath(relativePath);
        return normalizedPath ? path.join(normalizedPath, name) : name;
    }

    private async readTextContent(targetPath: string): Promise<{ buffer: Buffer; content: string }> {
        const buffer = await fs.readFile(targetPath);
        if (buffer.length > MAX_STACK_FILE_SIZE) {
            throw new ValidationError("Files larger than 1 MiB cannot be edited.");
        }
        if (buffer.includes(0)) {
            throw new ValidationError("Binary files cannot be edited.");
        }

        try {
            return {
                buffer,
                content: new TextDecoder("utf-8", {
                    fatal: true,
                }).decode(buffer),
            };
        } catch (e) {
            throw new ValidationError("Only UTF-8 text files can be edited.");
        }
    }

    private fileContentResult(relativePath: string, content: string, stat: Stats, version: string): StackFileContent {
        return {
            path: this.normalizeRelativePath(relativePath),
            content,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            version,
        };
    }

    private fileVersion(content: Buffer): string {
        return createHash("sha256").update(content).digest("hex");
    }
}

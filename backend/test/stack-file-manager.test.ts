import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MAX_STACK_FILE_SIZE, StackFileManager } from "../stack-file-manager";

test("StackFileManager safely lists, reads, and writes stack files", async (t) => {
    const sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-stack-files-"));
    const stackPath = path.join(sandboxPath, "example");
    const outsidePath = path.join(sandboxPath, "outside.txt");
    await fs.mkdir(path.join(stackPath, "config"), {
        recursive: true,
    });
    await fs.writeFile(path.join(stackPath, "compose.yaml"), "services: {}\n");
    await fs.writeFile(path.join(stackPath, "config", "app.txt"), "first\n");
    await fs.writeFile(path.join(stackPath, "binary.dat"), Buffer.from([ 0, 1, 2 ]));
    await fs.writeFile(path.join(stackPath, "large.txt"), "x".repeat(MAX_STACK_FILE_SIZE + 1));
    await fs.writeFile(outsidePath, "outside\n");
    t.after(async () => {
        await fs.rm(sandboxPath, {
            recursive: true,
            force: true,
        });
    });

    const manager = new StackFileManager(stackPath);

    await t.test("lists directories before files", async () => {
        const result = await manager.listDirectory("");
        assert.deepEqual(result.entries.map(entry => [ entry.name, entry.type ]), [
            [ "config", "directory" ],
            [ "binary.dat", "file" ],
            [ "compose.yaml", "file" ],
            [ "large.txt", "file" ],
        ]);
    });

    await t.test("reads and writes UTF-8 files with version checks", async () => {
        const file = await manager.readFile("config/app.txt");
        assert.equal(file.content, "first\n");

        const savedFile = await manager.writeFile("config/app.txt", "second\n", file.version);
        assert.equal(savedFile.content, "second\n");
        assert.notEqual(savedFile.version, file.version);
        assert.equal(await fs.readFile(path.join(stackPath, "config", "app.txt"), "utf8"), "second\n");

        // Keep the same byte length to prove version checks are based on content,
        // rather than timestamps or file size.
        await fs.writeFile(path.join(stackPath, "config", "app.txt"), "third!\n");
        await assert.rejects(
            manager.writeFile("config/app.txt", "stale edit\n", savedFile.version),
            /changed on disk/
        );
    });

    await t.test("blocks traversal, binary files, and oversized files", async () => {
        await assert.rejects(manager.listDirectory(".."), /outside this stack/);
        await assert.rejects(manager.readFile("binary.dat"), /Binary files/);
        await assert.rejects(manager.readFile("large.txt"), /larger than 1 MiB/);
    });

    if (process.platform !== "win32") {
        await t.test("does not follow symbolic links", async () => {
            await fs.symlink(outsidePath, path.join(stackPath, "outside-link"));
            await assert.rejects(manager.readFile("outside-link"), /Symbolic links/);
        });
    }
});

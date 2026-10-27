import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const approvalToken = randomUUID();
const children: ReturnType<typeof Bun.spawn>[] = [];

async function reserveAvailablePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Failed to reserve a sidecar port"));
				return;
			}
			server.close((error) => (error ? reject(error) : resolve(address.port)));
		});
	});
}

function spawn(command: string[], env: Record<string, string>) {
	const child = Bun.spawn(command, {
		cwd: import.meta.dir + "/..",
		env: { ...process.env, ...env },
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	children.push(child);
	return child;
}

function stopChildren(): void {
	for (const child of children) {
		if (!child.killed) child.kill();
	}
}

process.on("SIGINT", stopChildren);
process.on("SIGTERM", stopChildren);

async function main(): Promise<void> {
	const sidecarPort = await reserveAvailablePort();
	const endpoint = `ws://127.0.0.1:${sidecarPort}/transport?approval_token=${approvalToken}`;
	const openverseDir =
		process.env.OPEN_VERSE_DIR?.trim() ||
		process.env.CLINE_DIR?.trim() ||
		join(homedir(), ".openverse");

	const hubPort = process.env.CLINE_HUB_PORT?.trim() || "26736";

	const sidecar = spawn(["bun", "run", "sidecar/index.ts"], {
		CLINE_SIDECAR_APPROVAL_TOKEN: approvalToken,
		CLINE_SIDECAR_PORT: String(sidecarPort),
		OPEN_VERSE_DIR: openverseDir,
		CLINE_DIR: openverseDir,
		CLINE_HUB_PORT: hubPort,
		CLINE_CODE_CLOUD_AGENTS: "1",
		OPEN_VERSE_CLOUD_AGENTS: "1",
		CLINE_BUILD_ENV: "production",
	});
	const web = spawn(
		[
			process.execPath.includes("node") ? process.execPath : "node",
			"./node_modules/next/dist/bin/next",
			"dev",
			"webview",
			"-p",
			"3125",
		],
		{
			NEXT_PUBLIC_SIDECAR_WS_ENDPOINT: endpoint,
			OPEN_VERSE_DIR: openverseDir,
			CLINE_DIR: openverseDir,
			CLINE_HUB_PORT: hubPort,
			CLINE_CODE_CLOUD_AGENTS: "1",
			OPEN_VERSE_CLOUD_AGENTS: "1",
			CLINE_BUILD_ENV: "production",
		},
	);

	const exitCode = await Promise.race([sidecar.exited, web.exited]);
	stopChildren();
	await Promise.allSettled(children.map((child) => child.exited));
	process.exit(exitCode);
}

void main();

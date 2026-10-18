import { expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("rebuilds and restarts after API and shared package changes", async () => {
	const root = await mkdtemp(join(tmpdir(), "crm-api-dev-"));
	const api = join(root, "apps/api");
	await mkdir(join(api, "scripts"), { recursive: true });
	await mkdir(join(api, "src"));
	await mkdir(join(root, "packages"));
	await writeFile(
		join(api, "scripts/dev.ts"),
		await readFile(new URL("../scripts/dev.ts", import.meta.url)),
	);
	await writeFile(
		join(api, "package.json"),
		JSON.stringify({
			scripts: { build: "bun build src/main.ts --target=bun --outdir dist" },
		}),
	);
	const source = (label: string) =>
		`import { value } from "../../../packages/value"; console.log("BOOT:${label}:" + value); setInterval(() => {}, 1000);`;
	await writeFile(
		join(root, "packages/value.ts"),
		'export const value = "first";',
	);
	await writeFile(join(api, "src/main.ts"), source("initial"));
	const child = Bun.spawn([process.execPath, "scripts/dev.ts"], {
		cwd: api,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
	});
	let output = "";
	const read = async (stream: ReadableStream<Uint8Array>) => {
		for await (const chunk of stream) output += new TextDecoder().decode(chunk);
	};
	const readers = Promise.all([read(child.stdout), read(child.stderr)]);
	const until = async (text: string) => {
		const deadline = Date.now() + 5_000;
		while (!output.includes(text) && Date.now() < deadline) await Bun.sleep(25);
		expect(output).toContain(text);
	};
	try {
		await until("BOOT:initial:first");
		await writeFile(
			join(root, "packages/value.ts"),
			'export const value = "second";',
		);
		await until("BOOT:initial:second");
		await writeFile(join(api, "src/main.ts"), "export const invalid = ;");
		await until("error:");
		await writeFile(join(api, "src/main.ts"), source("recovered"));
		await until("BOOT:recovered:second");
	} finally {
		child.kill("SIGTERM");
		await child.exited;
		await readers;
	}
}, 20_000);

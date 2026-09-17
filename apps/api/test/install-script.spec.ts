import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "../../..");
const EMAIL = "owner@example.com";
const PASSWORD = "a long enough password";

const FAKE_DOCKER = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$*" in
	info | "compose version" | compose\\ pull*) exit 0 ;;
	volume\\ inspect*) exit 1 ;;
	"compose up -d --wait") exit "$FAKE_UP_EXIT" ;;
	*create-owner.ts\\ --exists)
		if [ -f "$FAKE_OWNER" ]; then echo "owner: exists"; else echo "owner: none"; fi
		;;
	*create-owner.ts\\ *) cat > "$FAKE_OWNER" ;;
	*) exit 1 ;;
esac
`;

let root = "";
let log = "";
let owner = "";

function run(upExit: number) {
	const result = Bun.spawnSync(["sh", "install.sh"], {
		cwd: root,
		env: {
			...process.env,
			PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
			RELOOP_DOMAIN: "localhost",
			RELOOP_EMAIL: EMAIL,
			RELOOP_PASSWORD: PASSWORD,
			FAKE_LOG: log,
			FAKE_OWNER: owner,
			FAKE_UP_EXIT: String(upExit),
		},
	});
	return {
		code: result.exitCode,
		out: result.stdout.toString() + result.stderr.toString(),
	};
}

function calls(): string[] {
	return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "reloop-install-"));
	log = join(root, "docker.log");
	owner = join(root, "owner");
	mkdirSync(join(root, "bin"));
	mkdirSync(join(root, "deploy"));
	cpSync(join(REPO, "install.sh"), join(root, "install.sh"));
	cpSync(
		join(REPO, "deploy/docker-compose.yml"),
		join(root, "deploy/docker-compose.yml"),
	);
	writeFileSync(join(root, "bin/docker"), FAKE_DOCKER);
	chmodSync(join(root, "bin/docker"), 0o755);
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("install.sh on a stranger's machine", () => {
	it("leaves .env behind and no owner when the stack fails to start", () => {
		const first = run(1);

		expect(first.code).not.toBe(0);
		expect(existsSync(join(root, "deploy/.env"))).toBe(true);
		expect(readFileSync(join(root, "deploy/.env"), "utf8")).toContain(
			`ALLOWED_SIGN_IN=${EMAIL}`,
		);
		expect(existsSync(owner)).toBe(false);
		expect(calls().some((call) => call.includes("create-owner"))).toBe(false);
	});

	it("creates the owner on the second run instead of locking the person out", () => {
		const second = run(0);

		expect(second.out).toContain("Reloop CRM is running");
		expect(second.code).toBe(0);
		expect(existsSync(owner)).toBe(true);
		expect(readFileSync(owner, "utf8")).toBe(PASSWORD);
		expect(
			calls().filter((call) => call.endsWith(`create-owner.ts ${EMAIL}`)),
		).toHaveLength(1);
	});

	it("never touches the owner's password once the account exists", () => {
		writeFileSync(owner, "the password the owner chose later");

		const third = run(0);

		expect(third.code).toBe(0);
		expect(third.out).toContain("The owner account exists");
		expect(readFileSync(owner, "utf8")).toBe(
			"the password the owner chose later",
		);
		expect(
			calls().filter((call) => call.endsWith(`create-owner.ts ${EMAIL}`)),
		).toHaveLength(1);
	});
});

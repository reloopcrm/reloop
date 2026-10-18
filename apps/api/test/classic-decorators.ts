import { plugin } from "bun";
import ts from "typescript";

plugin({
	name: "api-classic-decorators",
	setup(build) {
		build.onLoad(
			{ filter: /\/apps\/api\/(src|test)\/.*\.ts$/ },
			async ({ path }) => ({
				contents: ts.transpileModule(await Bun.file(path).text(), {
					fileName: path,
					compilerOptions: {
						target: ts.ScriptTarget.ESNext,
						module: ts.ModuleKind.ESNext,
						experimentalDecorators: true,
						emitDecoratorMetadata: true,
						esModuleInterop: true,
					},
				}).outputText,
				loader: "js",
			}),
		);
	},
});

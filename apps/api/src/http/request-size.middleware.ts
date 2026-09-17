import type { IncomingMessage, ServerResponse } from "node:http";
import { type RequestHandler, text } from "express";
import { REQUEST_SIZE } from "./http-config";

export function trpcBodyLimit(): RequestHandler {
	return text({
		type: "*/*",
		limit: REQUEST_SIZE.body.maxBytes,
		inflate: false,
	});
}

export function maxBodyBytes(url: string | undefined): number {
	return (url ?? "").startsWith(REQUEST_SIZE.auth.path)
		? REQUEST_SIZE.auth.maxBytes
		: REQUEST_SIZE.body.maxBytes;
}

export function requestSizeLimit() {
	return (
		request: IncomingMessage,
		response: ServerResponse,
		next: () => void,
	): void => {
		const declared = Number(request.headers["content-length"]);

		if (Number.isFinite(declared) && declared > maxBodyBytes(request.url)) {
			response.writeHead(413, { connection: "close" });
			response.end(() => {
				request.socket.destroy();
			});

			return;
		}

		next();
	};
}

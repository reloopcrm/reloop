export class BodyTooLargeError extends Error {}

export function cappedBody(
	body: ReadableStream<Uint8Array>,
	limit: number,
	onLimit: () => void,
): ReadableStream<Uint8Array> {
	let seen = 0;

	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				seen += chunk.byteLength;

				if (seen > limit) {
					onLimit();
					controller.error(new BodyTooLargeError());
					return;
				}

				controller.enqueue(chunk);
			},
		}),
	);
}

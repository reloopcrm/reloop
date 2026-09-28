const DEGREE = Math.PI / 180;

export const SCENE = {
	camera: { fov: 40, near: 1, far: 8000 },
	scrollScreens: 4,
	scrub: 0.6,
	card: { width: 288, mobileWidth: 232, height: 152, mobileBreakpoint: 640 },
	archive: {
		depth: { near: -500, far: -2600 },
		ring: { inner: 0.62, outer: 1.25 },
		tilt: { x: 8 * DEGREE, y: -14 * DEGREE },
		spin: 18 * DEGREE,
		sink: 2400,
	},
	chosen: {
		gap: 24,
		margin: 24,
		maxScale: 1.15,
		columns: 2,
		flip: 90 * DEGREE,
	},
	timeline: {
		heroOut: { at: 0, duration: 0.14 },
		sink: { at: 0.12, duration: 0.34, stagger: 0.012 },
		gather: { at: 0.14, duration: 0.3 },
		land: { at: 0.48, duration: 0.22, stagger: 0.05 },
		list: { at: 0.44, duration: 0.1 },
		caption: { at: 0.74, duration: 0.12 },
		end: 1,
	},
	count: { duration: 1.4, start: "top 85%" },
} as const;

export const MAIL = {
	dates: [
		"2023-03-14",
		"2022-11-02",
		"2024-01-22",
		"2021-09-08",
		"2023-07-19",
		"2022-05-30",
		"2024-04-11",
		"2021-12-06",
		"2023-10-03",
		"2022-02-17",
		"2024-06-25",
		"2021-06-14",
		"2023-01-09",
		"2022-08-23",
	],
	senderWidths: ["w-24", "w-32", "w-20", "w-28"],
	previewWidths: ["w-full", "w-5/6", "w-2/3", "w-3/4"],
	chosen: [3, 8, 4, 10],
} as const;

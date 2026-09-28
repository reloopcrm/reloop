"use client";

import { Badge } from "@crm/ui/components/badge";
import GoogleLogo from "@crm/ui/components/brand-logos/google";
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
import { CardPanel } from "@crm/ui/components/card";
import { Display } from "@crm/ui/components/display";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { cn } from "@crm/ui/lib/utils";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { type CSSProperties, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MathUtils, Object3D, PerspectiveCamera, Scene } from "three";
import {
	CSS3DObject,
	CSS3DRenderer,
} from "three/addons/renderers/CSS3DRenderer.js";
import { MAIL, SCENE } from "./config";

export type SceneMail = {
	id: string;
	provider: "google" | "microsoft";
	providerName: string;
	subject: string;
	date: string;
	senderWidth: string;
	previewWidth: string;
};

export type SceneReason = { label: string; points: number };

export type SceneRow = {
	id: string;
	potential: string;
	strong: boolean;
	reasons: SceneReason[];
	total: number;
};

type Pose = { x: number; y: number; z: number; rx: number; ry: number };

type Landing = { x: number; y: number; sx: number; sy: number };

const MOTION = "(prefers-reduced-motion: no-preference)";

function noise(seed: number): number {
	const value = Math.sin(seed * 12.9898) * 43758.5453;
	return value - Math.floor(value);
}

function offsetWithin(node: HTMLElement, root: HTMLElement) {
	let x = 0;
	let y = 0;
	let current: Element | null = node;
	while (current instanceof HTMLElement && current !== root) {
		x += current.offsetLeft;
		y += current.offsetTop;
		current = current.offsetParent;
	}
	return { x, y };
}

function Blurred({ className }: { className: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"block h-3 shrink-0 select-none rounded-xs bg-body-foreground/40 blur-xs",
				className,
			)}
		/>
	);
}

function MailCard({ mail }: { mail: SceneMail }) {
	const Logo = mail.provider === "google" ? GoogleLogo : MicrosoftLogo;

	return (
		<CardPanel className="size-full gap-3 p-4">
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				<Logo className="size-4 shrink-0" />
				<span>{mail.providerName}</span>
				<span className="ms-auto tabular-nums">{mail.date}</span>
			</div>
			<Blurred className={mail.senderWidth} />
			<p className="truncate font-medium text-foreground text-sm">
				{mail.subject}
			</p>
			<div className="flex flex-col gap-2">
				<Blurred className="h-2 w-full bg-muted-foreground/30" />
				<Blurred
					className={cn("h-2 bg-muted-foreground/30", mail.previewWidth)}
				/>
			</div>
		</CardPanel>
	);
}

function Reasons({ reasons }: { reasons: SceneReason[] }) {
	return (
		<span className="flex flex-wrap gap-1.5">
			{reasons.map((reason) => (
				<Badge key={reason.label} variant="secondary">
					{reason.label}
					<span className="font-mono text-muted-foreground">
						+{reason.points}
					</span>
				</Badge>
			))}
		</span>
	);
}

export function WinBackScene({
	hero,
	caption,
	columns,
	callFirst,
	mails,
	rows,
}: {
	hero: { title: string; lede: string };
	caption: string;
	columns: {
		company: string;
		potential: string;
		reasons: string;
		points: string;
	};
	callFirst: string;
	mails: SceneMail[];
	rows: SceneRow[];
}) {
	const sectionRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const heroRef = useRef<HTMLDivElement>(null);
	const captionRef = useRef<HTMLParagraphElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
	const [slots, setSlots] = useState<HTMLDivElement[]>([]);

	useMountEffect(() => {
		const section = sectionRef.current;
		const stage = stageRef.current;
		const heroNode = heroRef.current;
		const captionNode = captionRef.current;
		const list = listRef.current;
		if (!section || !stage || !heroNode || !captionNode || !list) return;

		gsap.registerPlugin(ScrollTrigger);
		const media = gsap.matchMedia();

		media.add(MOTION, () => {
			const renderer = new CSS3DRenderer();
			stage.appendChild(renderer.domElement);

			const camera = new PerspectiveCamera(
				SCENE.camera.fov,
				1,
				SCENE.camera.near,
				SCENE.camera.far,
			);
			const scene = new Scene();
			const archive = new Object3D();
			scene.add(archive);

			const chosenIndex = new Map<number, number>(
				MAIL.chosen.map((mailIndex, rowIndex) => [mailIndex, rowIndex]),
			);

			const wrappers = mails.map(() => {
				const wrapper = document.createElement("div");
				wrapper.style.pointerEvents = "none";
				return wrapper;
			});
			const objects = wrappers.map((wrapper, index) => {
				const object = new CSS3DObject(wrapper);
				if (chosenIndex.has(index)) scene.add(object);
				else archive.add(object);
				return object;
			});

			const home: Pose[] = mails.map(() => ({
				x: 0,
				y: 0,
				z: 0,
				rx: 0,
				ry: 0,
			}));
			const alpha: number[] = mails.map(() => 1);
			const landing: Landing[] = rows.map(() => ({ x: 0, y: 0, sx: 1, sy: 1 }));
			const gathered = rows.map(() => ({ x: 0, y: 0, z: 0 }));

			const layout = () => {
				const width = stage.clientWidth;
				const height = stage.clientHeight;
				if (width === 0 || height === 0) return;

				renderer.setSize(width, height);
				camera.aspect = width / height;
				const distance =
					height / 2 / Math.tan(MathUtils.degToRad(SCENE.camera.fov / 2));
				camera.position.set(0, 0, distance);
				camera.updateProjectionMatrix();

				const cardWidth =
					width < SCENE.card.mobileBreakpoint
						? SCENE.card.mobileWidth
						: SCENE.card.width;
				for (const wrapper of wrappers) {
					wrapper.style.width = `${cardWidth}px`;
					wrapper.style.height = `${SCENE.card.height}px`;
				}

				const { depth, ring, spin } = SCENE.archive;
				mails.forEach((_, index) => {
					const angle = index * 2.399963 + noise(index + 1);
					const radius = MathUtils.lerp(
						ring.inner,
						ring.outer,
						noise(index + 7),
					);
					const depthShare = noise(index + 13);
					const z = MathUtils.lerp(depth.near, depth.far, depthShare);
					const grow = (distance - z) / distance;
					home[index] = {
						x: Math.cos(angle) * radius * (width / 2) * grow,
						y: Math.sin(angle) * radius * (height / 2) * grow,
						z,
						rx: (noise(index + 29) - 0.5) * spin,
						ry: (noise(index + 31) - 0.5) * spin * 2,
					};
					alpha[index] = MathUtils.lerp(0.9, 0.35, depthShare);
				});

				const { gap, margin, maxScale, columns } = SCENE.chosen;
				const gridWidth = columns * cardWidth + (columns - 1) * gap;
				const gridRows = Math.ceil(rows.length / columns);
				const gridHeight = gridRows * SCENE.card.height + (gridRows - 1) * gap;
				const fit = Math.min(
					maxScale,
					(width - 2 * margin) / gridWidth,
					(height - 2 * margin) / gridHeight,
				);
				const gatherZ = distance - distance / fit;
				rows.forEach((_, rowIndex) => {
					const column = rowIndex % columns;
					const line = Math.floor(rowIndex / columns);
					gathered[rowIndex] = {
						x: (column - (columns - 1) / 2) * (cardWidth + gap),
						y: ((gridRows - 1) / 2 - line) * (SCENE.card.height + gap),
						z: gatherZ,
					};
				});

				const stageBox = stage.getBoundingClientRect();
				const listBox = list.getBoundingClientRect();
				rows.forEach((_, rowIndex) => {
					const row = rowRefs.current[rowIndex];
					if (!row) return;
					const offset = offsetWithin(row, list);
					const centerX =
						listBox.left - stageBox.left + offset.x + row.offsetWidth / 2;
					const centerY =
						listBox.top - stageBox.top + offset.y + row.offsetHeight / 2;
					landing[rowIndex] = {
						x: centerX - width / 2,
						y: -(centerY - height / 2),
						sx: row.offsetWidth / cardWidth,
						sy: row.offsetHeight / SCENE.card.height,
					};
				});
			};

			const draw = () => renderer.render(scene, camera);

			const { timeline: steps, archive: look, chosen } = SCENE;
			const timeline = gsap.timeline({
				defaults: { ease: "none" },
				onUpdate: draw,
				scrollTrigger: {
					trigger: section,
					start: "top top",
					end: "bottom bottom",
					scrub: SCENE.scrub,
					invalidateOnRefresh: true,
				},
			});

			timeline.fromTo(
				heroNode,
				{ autoAlpha: 1, y: 0 },
				{ autoAlpha: 0, y: -48, duration: steps.heroOut.duration },
				steps.heroOut.at,
			);

			timeline.fromTo(
				archive.rotation,
				{ x: look.tilt.x, y: look.tilt.y },
				{ x: 0, y: 0, duration: steps.land.at, ease: "power1.inOut" },
				0,
			);

			let sunk = 0;
			objects.forEach((object, index) => {
				const wrapper = wrappers[index];
				if (!wrapper || chosenIndex.has(index)) return;
				const at = steps.sink.at + sunk * steps.sink.stagger;
				sunk += 1;
				timeline.fromTo(
					object.position,
					{
						x: () => home[index]?.x ?? 0,
						y: () => home[index]?.y ?? 0,
						z: () => home[index]?.z ?? 0,
					},
					{
						z: () => (home[index]?.z ?? 0) - look.sink,
						duration: steps.sink.duration,
						ease: "power2.in",
					},
					at,
				);
				timeline.fromTo(
					object.rotation,
					{ x: () => home[index]?.rx ?? 0, y: () => home[index]?.ry ?? 0 },
					{ x: 0, y: 0, duration: steps.sink.duration },
					at,
				);
				timeline.fromTo(
					wrapper,
					{ autoAlpha: () => alpha[index] ?? 1 },
					{ autoAlpha: 0, duration: steps.sink.duration },
					at,
				);
			});

			timeline.fromTo(
				list,
				{ autoAlpha: 0 },
				{ autoAlpha: 1, duration: steps.list.duration },
				steps.list.at,
			);

			for (const [index, rowIndex] of chosenIndex) {
				const object = objects[index];
				const wrapper = wrappers[index];
				const row = rowRefs.current[rowIndex];
				if (!object || !wrapper || !row) continue;
				const target = () => landing[rowIndex] ?? { x: 0, y: 0, sx: 1, sy: 1 };
				const landAt = steps.land.at + rowIndex * steps.land.stagger;

				timeline.fromTo(
					object.position,
					{
						x: () => home[index]?.x ?? 0,
						y: () => home[index]?.y ?? 0,
						z: () => home[index]?.z ?? 0,
					},
					{
						x: () => gathered[rowIndex]?.x ?? 0,
						y: () => gathered[rowIndex]?.y ?? 0,
						z: () => gathered[rowIndex]?.z ?? 0,
						duration: steps.gather.duration,
						ease: "power2.out",
					},
					steps.gather.at,
				);
				timeline.fromTo(
					object.rotation,
					{ x: () => home[index]?.rx ?? 0, y: () => home[index]?.ry ?? 0 },
					{ x: 0, y: 0, duration: steps.gather.duration, ease: "power2.out" },
					steps.gather.at,
				);
				timeline.fromTo(
					wrapper,
					{ autoAlpha: () => alpha[index] ?? 1 },
					{ autoAlpha: 1, duration: steps.gather.duration },
					steps.gather.at,
				);

				timeline.fromTo(
					object.position,
					{
						x: () => gathered[rowIndex]?.x ?? 0,
						y: () => gathered[rowIndex]?.y ?? 0,
						z: () => gathered[rowIndex]?.z ?? 0,
					},
					{
						x: () => target().x,
						y: () => target().y,
						z: 0,
						duration: steps.land.duration,
						ease: "power2.inOut",
						immediateRender: false,
					},
					landAt,
				);
				timeline.fromTo(
					object.scale,
					{ x: 1, y: 1 },
					{
						x: () => target().sx,
						y: () => target().sy,
						duration: steps.land.duration,
						immediateRender: false,
					},
					landAt,
				);
				timeline.fromTo(
					object.rotation,
					{ x: 0 },
					{
						x: chosen.flip,
						duration: steps.land.duration,
						ease: "power1.in",
						immediateRender: false,
					},
					landAt,
				);
				timeline.fromTo(
					wrapper,
					{ autoAlpha: 1 },
					{
						autoAlpha: 0,
						duration: steps.land.duration / 2,
						immediateRender: false,
					},
					landAt + steps.land.duration / 2,
				);
				timeline.fromTo(
					row,
					{ rotationX: -90, autoAlpha: 0, transformPerspective: 900 },
					{ rotationX: 0, autoAlpha: 1, duration: steps.land.duration / 2 },
					landAt + steps.land.duration / 2,
				);
			}

			timeline.fromTo(
				captionNode,
				{ autoAlpha: 0, y: 16 },
				{ autoAlpha: 1, y: 0, duration: steps.caption.duration },
				steps.caption.at,
			);
			timeline.set({}, {}, steps.end);

			const refresh = () => {
				layout();
			};
			ScrollTrigger.addEventListener("refreshInit", refresh);
			ScrollTrigger.addEventListener("refresh", draw);
			setSlots(wrappers);
			layout();
			ScrollTrigger.refresh();
			draw();

			return () => {
				ScrollTrigger.removeEventListener("refreshInit", refresh);
				ScrollTrigger.removeEventListener("refresh", draw);
				setSlots([]);
				renderer.domElement.remove();
			};
		});

		return () => media.revert();
	});

	const sceneHeight = {
		"--scene-height": `${SCENE.scrollScreens * 100}svh`,
	} as CSSProperties;

	return (
		<section
			ref={sectionRef}
			style={sceneHeight}
			className="relative h-(--scene-height) w-full motion-reduce:h-auto"
		>
			<div className="sticky top-0 flex h-svh w-full flex-col items-center justify-center overflow-hidden px-4 motion-reduce:static motion-reduce:h-auto motion-reduce:gap-16 motion-reduce:py-20 md:px-6">
				<div className="flex w-full max-w-(--container-page) flex-col items-center gap-6 motion-reduce:order-last">
					<p
						ref={captionRef}
						className="invisible max-w-(--container-sheet) text-balance text-center text-body-foreground text-lg motion-reduce:visible md:text-xl"
					>
						{caption}
					</p>
					<CardPanel
						ref={listRef}
						className="invisible relative w-full motion-reduce:visible"
					>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{columns.company}</TableHead>
									<TableHead className="max-sm:hidden">
										{columns.potential}
									</TableHead>
									<TableHead className="max-md:hidden">
										{columns.reasons}
									</TableHead>
									<TableHead className="text-right">{columns.points}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row, index) => (
									<TableRow
										key={row.id}
										ref={(node) => {
											rowRefs.current[index] = node;
										}}
									>
										<TableCell>
											<span className="flex min-w-0 flex-col gap-2 py-1">
												<span className="flex items-center gap-2">
													<Blurred className="w-28" />
													{index === 0 ? (
														<Badge variant="outline">{callFirst}</Badge>
													) : null}
												</span>
												<Blurred className="h-2 w-20 bg-muted-foreground/30" />
												<span className="md:hidden">
													<Reasons reasons={row.reasons} />
												</span>
											</span>
										</TableCell>
										<TableCell className="max-sm:hidden">
											<span
												className={
													row.strong
														? "text-foreground"
														: "text-muted-foreground"
												}
											>
												{row.potential}
											</span>
										</TableCell>
										<TableCell className="max-md:hidden">
											<Reasons reasons={row.reasons} />
										</TableCell>
										<TableCell className="text-right font-mono text-foreground tabular-nums">
											{row.total}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardPanel>
				</div>
				<div
					ref={stageRef}
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 motion-reduce:hidden"
				/>
				<div
					ref={heroRef}
					className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center motion-reduce:static motion-reduce:px-0"
				>
					<Display size="hero" case="upper">
						{hero.title}
					</Display>
					<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-xl">
						{hero.lede}
					</p>
				</div>
			</div>
			{slots.map((slot, index) => {
				const mail = mails[index];
				return mail
					? createPortal(<MailCard mail={mail} />, slot, mail.id)
					: null;
			})}
		</section>
	);
}

export function CountUp({
	value,
	text,
	tag,
	decimals = 0,
	percent = false,
	className,
}: {
	value: number;
	text: string;
	tag: string;
	decimals?: number;
	percent?: boolean;
	className?: string;
}) {
	const ref = useRef<HTMLSpanElement>(null);

	useMountEffect(() => {
		const node = ref.current?.firstChild;
		if (!(node instanceof Text)) return;

		gsap.registerPlugin(ScrollTrigger);
		const format = new Intl.NumberFormat(tag, {
			style: percent ? "percent" : "decimal",
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		});
		const show = (current: number) => {
			node.nodeValue = format.format(percent ? current / 100 : current);
		};
		const media = gsap.matchMedia();

		media.add(MOTION, () => {
			const counter = { value: 0 };
			show(0);
			gsap.to(counter, {
				value,
				duration: SCENE.count.duration,
				ease: "power2.out",
				scrollTrigger: {
					trigger: node.parentElement,
					start: SCENE.count.start,
					once: true,
				},
				onUpdate: () => show(counter.value),
				onComplete: () => {
					node.nodeValue = text;
				},
			});
			return () => {
				node.nodeValue = text;
			};
		});

		return () => media.revert();
	});

	return (
		<span ref={ref} className={className}>
			{text}
		</span>
	);
}

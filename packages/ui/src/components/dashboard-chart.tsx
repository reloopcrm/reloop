"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@crm/ui/components/chart";
import type { Bloom } from "@crm/ui/lib/dither";
import { cn } from "@crm/ui/lib/utils";
import * as React from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Label,
	LabelList,
	Pie,
	PieChart,
	Text,
	XAxis,
} from "recharts";

const CHART = {
	plot: { margin: { left: 0, right: 0, top: 10, bottom: 0 } },
	axis: { tickMargin: 12, fontSize: 12 },
	series: {
		strokeWidth: 2,
		activeDotRadius: 3,
		fadeFrom: 0.3,
		fadeTo: 0,
	},
	bar: {
		radius: [2, 2, 0, 0],
		maxSize: 40,
		labelFontSize: 12,
		labelTopMargin: 24,
	},
	donut: {
		innerRatio: 0.34,
		outerRatio: 0.46,
		padAngle: 2,
		labelOffset: 20,
	},
	bloom: { low: 2, high: 5, aura: { inner: 3, outer: 9 } },
	dither: {
		dotTile: 4,
		dotSize: 1.4,
		hatchTile: 6,
		hatchWidth: 1.5,
		hatchAngle: 45,
		fade: { top: 0.06, mid: 0.45, bottom: 0.95 },
	},
} as const;

type Datum = Record<string, number | string | null>;

type CartesianProps = {
	data: Datum[];
	config: ChartConfig;
	xKey: string;
	series?: string[];
	className?: string;
	height?: number;
	showXAxis?: boolean;
	showLegend?: boolean;
	formatX?: (value: string) => string;
	formatValue?: (value: number | string) => string;
};

function seriesKeys(config: ChartConfig, series?: string[]) {
	return series ?? Object.keys(config);
}

const tooltip = (
	formatX?: (value: string) => string,
	formatValue?: (value: number | string) => string,
) => (
	<ChartTooltip
		cursor={false}
		content={
			<ChartTooltipContent
				indicator="dot"
				labelFormatter={formatX ? (label) => formatX(String(label)) : undefined}
				valueFormatter={formatValue}
			/>
		}
	/>
);

const X_AXIS_PROPS = {
	tickLine: false,
	axisLine: false,
	tickMargin: CHART.axis.tickMargin,
} as const;

function EdgeTick({
	x,
	y,
	payload,
	index,
	visibleTicksCount,
	formatX,
}: {
	x?: number;
	y?: number;
	payload?: { value: string | number };
	index?: number;
	visibleTicksCount?: number;
	formatX?: (value: string) => string;
}) {
	const isFirst = index === 0;
	const isLast = index === (visibleTicksCount ?? 0) - 1;
	const anchor = isFirst ? "start" : isLast ? "end" : "middle";
	const raw = String(payload?.value ?? "");
	return (
		<Text
			x={x}
			y={y}
			textAnchor={anchor}
			verticalAnchor="start"
			className="fill-muted-foreground text-xs"
		>
			{formatX ? formatX(raw) : raw}
		</Text>
	);
}

type DitherVariant = "gradient" | "dotted" | "hatched" | "solid";

function bloomFilter(bloom: Bloom, color: string) {
	switch (bloom) {
		case "low":
			return `drop-shadow(0 0 ${CHART.bloom.low}px ${color})`;
		case "high":
			return `drop-shadow(0 0 ${CHART.bloom.high}px ${color})`;
		case "aura":
			return `drop-shadow(0 0 ${CHART.bloom.aura.inner}px ${color}) drop-shadow(0 0 ${CHART.bloom.aura.outer}px ${color})`;
		default:
			return undefined;
	}
}

function ditherPatternId(base: string, key: string) {
	return `${base}-dither-${key}`;
}

function ditherFadeId(base: string, key: string) {
	return `${base}-fade-${key}`;
}

function DitherDefs({
	base,
	keys,
	variant,
}: {
	base: string;
	keys: string[];
	variant: DitherVariant;
}) {
	if (variant === "solid") {
		return null;
	}
	return (
		<>
			{keys.map((key) => {
				const color = `var(--color-${key})`;
				const id = ditherPatternId(base, key);
				if (variant === "hatched") {
					return (
						<pattern
							key={id}
							id={id}
							width={CHART.dither.hatchTile}
							height={CHART.dither.hatchTile}
							patternUnits="userSpaceOnUse"
							patternTransform={`rotate(${CHART.dither.hatchAngle})`}
						>
							<line
								x1={0}
								y1={0}
								x2={0}
								y2={CHART.dither.hatchTile}
								stroke={color}
								strokeWidth={CHART.dither.hatchWidth}
							/>
						</pattern>
					);
				}
				return (
					<pattern
						key={id}
						id={id}
						width={CHART.dither.dotTile}
						height={CHART.dither.dotTile}
						patternUnits="userSpaceOnUse"
					>
						<rect
							x={0}
							y={0}
							width={CHART.dither.dotSize}
							height={CHART.dither.dotSize}
							fill={color}
						/>
						<rect
							x={CHART.dither.dotTile / 2}
							y={CHART.dither.dotTile / 2}
							width={CHART.dither.dotSize}
							height={CHART.dither.dotSize}
							fill={color}
						/>
					</pattern>
				);
			})}
			{variant === "gradient"
				? keys.map((key) => {
						const fadeId = ditherFadeId(base, key);
						const fadeGradId = `${fadeId}-grad`;
						return (
							<React.Fragment key={fadeId}>
								<linearGradient id={fadeGradId} x1="0" y1="0" x2="0" y2="1">
									<stop
										offset="0%"
										stopColor="white"
										stopOpacity={CHART.dither.fade.top}
									/>
									<stop
										offset="55%"
										stopColor="white"
										stopOpacity={CHART.dither.fade.mid}
									/>
									<stop
										offset="100%"
										stopColor="white"
										stopOpacity={CHART.dither.fade.bottom}
									/>
								</linearGradient>
								<mask id={fadeId}>
									<rect
										x="0"
										y="0"
										width="100%"
										height="100%"
										fill={`url(#${fadeGradId})`}
									/>
								</mask>
							</React.Fragment>
						);
					})
				: null}
		</>
	);
}

function AreaTrend({
	data,
	config,
	xKey,
	series,
	className,
	height = 200,
	showXAxis = true,
	showLegend = false,
	formatX,
	formatValue,
	stacked = false,
	variant = "gradient",
	bloom = "low",
}: CartesianProps & {
	stacked?: boolean;
	variant?: DitherVariant;
	bloom?: Bloom;
}) {
	const keys = seriesKeys(config, series);
	const gradientId = React.useId().replace(/:/g, "");
	const dithered = variant !== "solid";

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto w-full", className)}
			style={{ height }}
		>
			<AreaChart data={data} margin={CHART.plot.margin}>
				<defs>
					{keys.map((key) => (
						<linearGradient
							key={key}
							id={`${gradientId}-${key}`}
							x1="0"
							y1="0"
							x2="0"
							y2="1"
						>
							<stop
								offset="5%"
								stopColor={`var(--color-${key})`}
								stopOpacity={CHART.series.fadeFrom}
							/>
							<stop
								offset="95%"
								stopColor={`var(--color-${key})`}
								stopOpacity={CHART.series.fadeTo}
							/>
						</linearGradient>
					))}
					<DitherDefs base={gradientId} keys={keys} variant={variant} />
				</defs>
				<CartesianGrid vertical={false} stroke="var(--border)" />
				<XAxis
					dataKey={xKey}
					hide={!showXAxis}
					tick={<EdgeTick formatX={formatX} />}
					{...X_AXIS_PROPS}
				/>
				{tooltip(formatX, formatValue)}
				{keys.map((key) => (
					<Area
						key={key}
						dataKey={key}
						type="monotone"
						stroke={`var(--color-${key})`}
						strokeWidth={CHART.series.strokeWidth}
						fill={`url(#${gradientId}-${key})`}
						stackId={stacked ? "stack" : undefined}
						dot={false}
						activeDot={{ r: CHART.series.activeDotRadius, strokeWidth: 0 }}
						style={
							bloom === "off"
								? undefined
								: { filter: bloomFilter(bloom, `var(--color-${key})`) }
						}
					/>
				))}
				{dithered
					? keys.map((key) => (
							<Area
								key={`dither-${key}`}
								dataKey={key}
								type="monotone"
								stroke="none"
								fill={`url(#${ditherPatternId(gradientId, key)})`}
								fillOpacity={1}
								mask={
									variant === "gradient"
										? `url(#${ditherFadeId(gradientId, key)})`
										: undefined
								}
								stackId={stacked ? "dither-stack" : undefined}
								dot={false}
								activeDot={false}
								isAnimationActive={false}
								legendType="none"
								tooltipType="none"
							/>
						))
					: null}
				{showLegend ? (
					<ChartLegend
						verticalAlign="bottom"
						content={<ChartLegendContent />}
					/>
				) : null}
			</AreaChart>
		</ChartContainer>
	);
}

function BarTrend({
	data,
	config,
	xKey,
	series,
	className,
	height = 180,
	showXAxis = true,
	showLegend = false,
	formatX,
	formatValue,
	stacked = false,
	showGrid = true,
}: CartesianProps & { stacked?: boolean; showGrid?: boolean }) {
	const keys = seriesKeys(config, series);

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto w-full", className)}
			style={{ height }}
		>
			<BarChart data={data} margin={CHART.plot.margin}>
				{showGrid ? (
					<CartesianGrid vertical={false} stroke="var(--border)" />
				) : null}
				<XAxis
					dataKey={xKey}
					hide={!showXAxis}
					tick={<EdgeTick formatX={formatX} />}
					{...X_AXIS_PROPS}
				/>
				{tooltip(formatX, formatValue)}
				{keys.map((key) => (
					<Bar
						key={key}
						dataKey={key}
						fill={`var(--color-${key})`}
						radius={[...CHART.bar.radius]}
						stackId={stacked ? "stack" : undefined}
						maxBarSize={CHART.bar.maxSize}
					/>
				))}
				{showLegend ? (
					<ChartLegend
						verticalAlign="bottom"
						content={<ChartLegendContent />}
					/>
				) : null}
			</BarChart>
		</ChartContainer>
	);
}

type DonutSlice = { key: string; label: string; value: number; color: string };

function BarStat({
	data,
	className,
	height = 200,
	onBarClick,
	formatValue,
}: {
	data: DonutSlice[];
	className?: string;
	height?: number;
	onBarClick?: (key: string) => void;
	formatValue?: (value: number | string) => string;
}) {
	const config: ChartConfig = Object.fromEntries(
		data.map((d) => [d.key, { label: d.label, color: d.color }]),
	);

	return (
		<ChartContainer
			config={config}
			className={cn("aspect-auto w-full", className)}
			style={{ height }}
		>
			<BarChart
				data={data}
				margin={{ ...CHART.plot.margin, top: CHART.bar.labelTopMargin }}
			>
				<CartesianGrid vertical={false} stroke="var(--border)" />
				<XAxis
					dataKey="label"
					{...X_AXIS_PROPS}
					tick={{
						fill: "var(--muted-foreground)",
						fontSize: CHART.axis.fontSize,
					}}
				/>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							hideLabel
							nameKey="key"
							valueFormatter={formatValue}
						/>
					}
				/>
				<Bar
					dataKey="value"
					radius={[...CHART.bar.radius]}
					maxBarSize={CHART.bar.maxSize}
					className={onBarClick ? "cursor-pointer" : undefined}
					onClick={
						onBarClick
							? (_, index) => {
									const slice = data[index];
									if (slice) onBarClick(slice.key);
								}
							: undefined
					}
				>
					<LabelList
						dataKey="value"
						position="top"
						className="fill-foreground"
						fontSize={CHART.bar.labelFontSize}
					/>
					{data.map((slice) => (
						<Cell key={slice.key} fill={slice.color} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}

function DonutStat({
	data,
	className,
	height = 200,
	centerValue,
	centerLabel,
	onSliceClick,
	formatValue,
}: {
	data: DonutSlice[];
	className?: string;
	height?: number;
	centerValue?: React.ReactNode;
	centerLabel?: React.ReactNode;
	onSliceClick?: (key: string) => void;
	formatValue?: (value: number | string) => string;
}) {
	const config: ChartConfig = Object.fromEntries(
		data.map((d) => [d.key, { label: d.label, color: d.color }]),
	);
	const hasCenter = centerValue != null || centerLabel != null;
	const innerRadius = Math.round(height * CHART.donut.innerRatio);
	const outerRadius = Math.round(height * CHART.donut.outerRatio);

	return (
		<ChartContainer
			config={config}
			className={cn("mx-auto aspect-square", className)}
			style={{ height }}
		>
			<PieChart>
				<ChartTooltip
					cursor={false}
					content={
						<ChartTooltipContent
							hideLabel
							nameKey="key"
							valueFormatter={formatValue}
						/>
					}
				/>
				<Pie
					data={[{ value: 1 }]}
					dataKey="value"
					innerRadius={innerRadius}
					outerRadius={outerRadius}
					fill="var(--muted)"
					stroke="none"
					isAnimationActive={false}
				/>
				<Pie
					data={data}
					dataKey="value"
					nameKey="key"
					innerRadius={innerRadius}
					outerRadius={outerRadius}
					paddingAngle={data.length > 1 ? CHART.donut.padAngle : 0}
					className={onSliceClick ? "cursor-pointer" : undefined}
					onClick={
						onSliceClick
							? (_, index) => {
									const slice = data[index];
									if (slice) onSliceClick(slice.key);
								}
							: undefined
					}
				>
					{data.map((slice) => (
						<Cell key={slice.key} fill={slice.color} stroke="none" />
					))}
					{hasCenter ? (
						<Label
							content={({ viewBox }) => {
								if (!viewBox || !("cx" in viewBox)) return null;
								return (
									<text
										x={viewBox.cx}
										y={viewBox.cy}
										textAnchor="middle"
										dominantBaseline="middle"
									>
										<tspan
											x={viewBox.cx}
											y={viewBox.cy}
											className="fill-foreground font-medium text-2xl tabular-nums"
										>
											{String(centerValue ?? "")}
										</tspan>
										{centerLabel != null ? (
											<tspan
												x={viewBox.cx}
												y={(viewBox.cy ?? 0) + CHART.donut.labelOffset}
												className="fill-muted-foreground text-xs"
											>
												{String(centerLabel)}
											</tspan>
										) : null}
									</text>
								);
							}}
						/>
					) : null}
				</Pie>
			</PieChart>
		</ChartContainer>
	);
}

export type { Datum, DonutSlice };
export { AreaTrend, BarStat, BarTrend, DonutStat };

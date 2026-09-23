import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { isHosted } from "@crm/db/tenant-context";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isMarketing, isMarketingHost } from "@/lib/env";
import {
	landingMarkdown,
	markdownHeaders,
	notFoundMarkdown,
	prefersMarkdown,
} from "@/lib/markdown-negotiation";
import {
	ONBOARDING_PATH,
	PAUSED_PATH,
	readWorkspaceGate,
} from "@/lib/onboarding";
import { PROXY } from "@/lib/proxy-config";
import { cloudUrl } from "@/lib/site-links";
import { workspaceUrl } from "@/lib/workspace-url";

export const ANONYMOUS_PATHS = PROXY.anonymous;

export const MARKETING_PATHS = PROXY.marketing;

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const markdown = prefersMarkdown(request.headers.get("accept"));
	const marketingHost = isMarketingHost(requestHost(request));
	const marketing = isMarketing() || marketingHost;

	if (markdown && pathname === PROXY.path.landing && marketing) {
		return new NextResponse(landingMarkdown(), {
			headers: markdownHeaders(),
		});
	}

	if (marketingHost) return marketingSite(request, markdown);

	if (pathname === PROXY.path.signIn) return NextResponse.next();

	if (isAnonymous(pathname, marketing)) return NextResponse.next();

	if (
		getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }) === null
	) {
		if (isPublic(pathname, marketing)) return varyOnAccept(NextResponse.next());

		if (!isAppShaped(pathname, marketing)) return notFound(request, markdown);

		return NextResponse.redirect(new URL(PROXY.path.signIn, request.nextUrl));
	}

	if (isUngated(pathname)) return NextResponse.next();

	const workspace = await readWorkspaceGate(request);

	if (workspace.gate === "required") return sendTo(ONBOARDING_PATH, request);

	if (workspace.gate === "suspended") return sendTo(PAUSED_PATH, request);

	if (workspace.gate !== "settled" || !workspace.slug) {
		return NextResponse.next();
	}

	return sendTo(appPath(pathname, workspace.slug), request);
}

function requestHost(request: NextRequest): string | null {
	return (
		request.headers.get("x-forwarded-host") ??
		request.headers.get("host") ??
		request.nextUrl.host
	);
}

function marketingSite(request: NextRequest, markdown: boolean): NextResponse {
	const { pathname, search } = request.nextUrl;
	const cloud = cloudUrl();
	const toCloud = () =>
		cloud
			? NextResponse.redirect(new URL(`${pathname}${search}`, cloud))
			: null;

	if (PROXY.cloudOnly.some((path) => isUnder(pathname, path))) {
		return toCloud() ?? NextResponse.next();
	}

	if (pathname === PROXY.path.landing || isAnonymous(pathname, true)) {
		return varyOnAccept(NextResponse.next());
	}

	if (isAppShaped(pathname, true)) {
		return toCloud() ?? notFound(request, markdown);
	}

	return notFound(request, markdown);
}

function notFound(request: NextRequest, markdown: boolean): NextResponse {
	if (markdown) {
		return new NextResponse(notFoundMarkdown(request.nextUrl.pathname), {
			status: 404,
			headers: markdownHeaders(),
		});
	}

	return varyOnAccept(
		NextResponse.rewrite(new URL(PROXY.path.notFound, request.nextUrl), {
			status: 404,
		}),
	);
}

function varyOnAccept(response: NextResponse): NextResponse {
	response.headers.append("vary", "Accept");

	return response;
}

function appPath(pathname: string, slug: string): string {
	if (pathname === PROXY.path.landing || pathname === ONBOARDING_PATH) {
		return workspaceUrl(slug);
	}

	if (isSetup(pathname)) return pathname;

	if (isSection(pathname)) return workspaceUrl(slug, pathname);

	const [first, ...rest] = pathname.slice(1).split("/");

	if (first === slug) return pathname;

	return workspaceUrl(slug, rest.length ? `/${rest.join("/")}` : "/");
}

function isUnder(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublic(pathname: string, marketing: boolean): boolean {
	return pathname === PROXY.path.landing && marketing;
}

function isUngated(pathname: string): boolean {
	return PROXY.ungated.some((prefix) => isUnder(pathname, prefix));
}

function isSection(pathname: string): boolean {
	return PROXY.sections.some((section) => isUnder(pathname, section));
}

function isMarketingPath(pathname: string, marketing: boolean): boolean {
	if (
		marketing &&
		PROXY.marketing.some((prefix) => isUnder(pathname, prefix))
	) {
		return true;
	}

	return isHosted() && PROXY.hosted.some((prefix) => isUnder(pathname, prefix));
}

function isAnonymous(pathname: string, marketing: boolean): boolean {
	if (PROXY.anonymous.some((prefix) => isUnder(pathname, prefix))) return true;

	return isMarketingPath(pathname, marketing);
}

function isAppShaped(pathname: string, marketing: boolean): boolean {
	if (pathname === PROXY.path.landing) return true;

	if (isSetup(pathname) || isUngated(pathname)) return true;

	if (isMarketingPath(pathname, marketing)) return true;

	if (isSection(pathname)) return true;

	const [first, second] = pathname.slice(1).split("/");

	if (second === undefined) return isWorkspaceSegment(first);

	return isSection(`/${second}`) || isWorkspaceSegment(second);
}

function isWorkspaceSegment(segment: string | undefined): boolean {
	return PROXY.workspaceSegments.some((known) => known === segment);
}

function isSetup(pathname: string): boolean {
	return isUnder(pathname, ONBOARDING_PATH);
}

function sendTo(path: string, request: NextRequest): NextResponse {
	if (request.nextUrl.pathname === path) return NextResponse.next();

	const url = new URL(path, request.nextUrl);
	url.search = request.nextUrl.search;

	return NextResponse.redirect(url);
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|webmanifest)$).*)",
	],
};

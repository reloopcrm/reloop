import { LOCALES } from "@crm/db/locale";
import { PLAN_IDS } from "@crm/db/plans";
import { planPurchase } from "@crm/db/pricing";
import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(1).max(1024);
const code = z
	.string()
	.trim()
	.regex(/^\d{6}$/);

export const tenantLookupInput = z.object({ email });

export type TenantLookupInput = z.infer<typeof tenantLookupInput>;

export const TENANT_SIGN_IN_METHODS = ["google", "microsoft", "email"] as const;

export type TenantSignInMethod = (typeof TENANT_SIGN_IN_METHODS)[number];

export const TENANT_LOOKUP_STATUSES = [
	"pending",
	"active",
	"suspended",
] as const;

export const tenantLookupResult = z.object({
	tenantId: z.string().min(1),
	signIn: z.array(z.enum(TENANT_SIGN_IN_METHODS)),
	status: z.enum(TENANT_LOOKUP_STATUSES),
});

export type TenantLookupResult = z.infer<typeof tenantLookupResult>;

export const tenantSignupInput = z.object({
	email,
	name: z.string().trim().min(1).max(120),
	company: z.string().trim().min(1).max(120),
	plan: z.enum(PLAN_IDS),
	locale: z.enum(LOCALES),
	password: password.optional(),
	purchase: planPurchase.optional(),
});

export type TenantSignupInput = z.infer<typeof tenantSignupInput>;

export const tenantSignupResult = z.object({
	tenantId: z.string().min(1),
	next: z.enum(["verify-email", "oauth"]),
	provider: z.enum(["google", "microsoft"]).optional(),
});

export type TenantSignupResult = z.infer<typeof tenantSignupResult>;

export const tenantSignupOptions = z.object({
	password: z.boolean(),
	signIn: z.array(z.enum(TENANT_SIGN_IN_METHODS)),
});

export type TenantSignupOptions = z.infer<typeof tenantSignupOptions>;

export const tenantVerifyInput = z.object({ email, code });

export type TenantVerifyInput = z.infer<typeof tenantVerifyInput>;

export const tenantVerifyResult = z.object({ tenantId: z.string().min(1) });

export type TenantVerifyResult = z.infer<typeof tenantVerifyResult>;

export const tenantResetInput = z.object({
	email,
	locale: z.enum(LOCALES).default("en"),
});

export type TenantResetInput = z.infer<typeof tenantResetInput>;

export const tenantResetConfirmInput = z.object({ email, code, password });

export type TenantResetConfirmInput = z.infer<typeof tenantResetConfirmInput>;

export const tenantDone = z.object({ ok: z.literal(true) });

export type TenantDone = z.infer<typeof tenantDone>;

export const TENANT_SIGNUP_CODES = {
	noWorkspace: "NO_WORKSPACE",
	workspaceExists: "WORKSPACE_EXISTS",
	tooMany: "TOO_MANY_REQUESTS",
	notHosted: "NOT_HOSTED",
	noMail: "NO_MAIL",
	codeInvalid: "CODE_INVALID",
	codeExpired: "CODE_EXPIRED",
	codeLocked: "CODE_LOCKED",
} as const;

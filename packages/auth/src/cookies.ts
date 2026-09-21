export const AUTH_COOKIE_PREFIX = "crm";
export const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;
export const TENANT_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.tenant`;

const DAY_S = 24 * 60 * 60;

export const TENANT_COOKIE = {
	maxAgeSeconds: 365 * DAY_S,
} as const;

export const CONTACT_INPUT = {
	maxNameChars: 120,
	maxEmailChars: 254,
	maxPhoneChars: 50,
	maxTitleChars: 200,
	maxIdChars: 64,
} as const;

export const CONTACT_MESSAGES = {
	emailInUse: "Another contact already uses that email address.",
	emailSuppressed:
		"That address belongs to a person who was deleted for good, so it cannot be added again.",
	companyMissing: "That company does not exist or is archived.",
} as const;

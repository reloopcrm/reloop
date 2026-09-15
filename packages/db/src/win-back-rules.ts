export type WinBackRuleSet = {
	v: 1;
	include: {
		neverReplied: boolean;
		requireCompany: boolean;
		requireDeal: boolean;
		requireMeeting: boolean;
		requireTopic: boolean;
		minEmails: number;
		minFromThem: number;
	};
	business: {
		description: string;
		products: string[];
		sideProducts: string[];
		minPallets: number;
		minBoxes: number;
		boxProducts: string[];
		unit: string;
		learnedFromMail: boolean;
	};
	points: {
		waitingOnUs: number;
		perEmailFromThem: number;
		perEmailFromUs: number;
		perMeeting: number;
		openDeal: number;
		wonDeal: number;
		hasCompany: number;
		titleKeyword: number;
		pastBusiness: number;
		openInquiry: number;
		bigQuantity: number;
		productMatch: number;
		sideProductMatch: number;
		goodFeedback: number;
	};
	titleKeywords: string[];
	excludedDomains: string[];
};

export const DEFAULT_WIN_BACK_RULES: WinBackRuleSet = {
	v: 1,
	include: {
		neverReplied: true,
		requireCompany: false,
		requireDeal: false,
		requireMeeting: false,
		requireTopic: true,
		minEmails: 1,
		minFromThem: 1,
	},
	business: {
		description: "",
		products: [],
		sideProducts: [],
		minPallets: 0,
		minBoxes: 0,
		boxProducts: [],
		unit: "units",
		learnedFromMail: false,
	},
	points: {
		waitingOnUs: 10,
		perEmailFromThem: 1,
		perEmailFromUs: 1,
		perMeeting: 5,
		openDeal: 25,
		wonDeal: 20,
		hasCompany: 5,
		titleKeyword: 5,
		pastBusiness: 40,
		openInquiry: 50,
		bigQuantity: 35,
		productMatch: 10,
		sideProductMatch: 4,
		goodFeedback: 25,
	},
	titleKeywords: ["Owner", "Founder", "CEO", "Purchasing", "Head", "Director"],
	excludedDomains: [],
};

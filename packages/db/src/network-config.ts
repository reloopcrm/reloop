export const NETWORK = {
	maxRedirects: 3,
	timeoutMs: 5_000,
	readTimeoutMs: 15_000,
	metadataAddresses: {
		ipv4: ["169.254.169.254", "168.63.129.16", "100.100.100.200"],
		ipv6: ["fd00:ec2::254"],
	},
} as const;

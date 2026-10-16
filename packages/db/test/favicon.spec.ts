import { describe, expect, it } from "bun:test";
import { isBlockedAddress } from "../src/favicon";

describe("isBlockedAddress", () => {
	it("blocks loopback however it is written", () => {
		for (const ip of [
			"127.0.0.1",
			"127.1.2.3",
			"::1",
			"0:0:0:0:0:0:0:1",
			"::ffff:127.0.0.1",
			"::ffff:7f00:1",
			"::ffff:7F00:0001",
			"::7f00:1",
		])
			expect(isBlockedAddress(ip)).toBe(true);
	});

	it("blocks cloud metadata and the private ranges", () => {
		for (const ip of [
			"169.254.169.254",
			"::ffff:a9fe:a9fe",
			"10.0.0.1",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"100.64.0.1",
			"198.18.0.1",
			"0.0.0.0",
			"::",
			"224.0.0.1",
			"fd00::1",
			"fc00::1",
			"fe80::1",
			"fe80::1%eth0",
			"ff02::1",
		])
			expect(isBlockedAddress(ip)).toBe(true);
	});

	it("allows public addresses", () => {
		for (const ip of [
			"1.1.1.1",
			"8.8.8.8",
			"172.32.0.1",
			"192.169.0.1",
			"223.255.255.255",
			"2606:4700:4700::1111",
			"::ffff:8.8.8.8",
			"::ffff:808:808",
		])
			expect(isBlockedAddress(ip)).toBe(false);
	});

	it("blocks a translation prefix by the address inside it", () => {
		for (const ip of [
			"64:ff9b::7f00:1",
			"64:ff9b::127.0.0.1",
			"64:ff9b::c0a8:101",
			"64:ff9b::a9fe:a9fe",
			"2002:7f00:1::",
			"2002:c0a8:101::1",
			"2002:a9fe:a9fe::1",
		])
			expect(isBlockedAddress(ip)).toBe(true);
	});

	it("passes a translation prefix around a public address", () => {
		for (const ip of [
			"64:ff9b::808:808",
			"64:ff9b::8.8.8.8",
			"2002:808:808::1",
		])
			expect(isBlockedAddress(ip)).toBe(false);
	});

	it("blocks the protocol and documentation ranges", () => {
		for (const ip of [
			"192.0.0.1",
			"192.0.0.170",
			"192.0.2.1",
			"198.51.100.7",
			"203.0.113.9",
			"::ffff:192.0.2.1",
		])
			expect(isBlockedAddress(ip)).toBe(true);
	});

	it("passes the public neighbours of those ranges", () => {
		for (const ip of [
			"192.0.1.1",
			"192.0.3.1",
			"198.51.101.1",
			"203.0.114.1",
			"168.63.129.17",
		])
			expect(isBlockedAddress(ip)).toBe(false);
	});

	it("blocks every cloud metadata address, also on a private webhook", () => {
		for (const ip of [
			"169.254.169.254",
			"168.63.129.16",
			"100.100.100.200",
			"fd00:ec2::254",
			"fd00:ec2:0:0:0:0:0:254",
			"::ffff:100.100.100.200",
			"::ffff:a83f:8110",
			"64:ff9b::a9fe:a9fe",
			"2002:6464:64c8::",
		]) {
			expect(isBlockedAddress(ip)).toBe(true);
			expect(isBlockedAddress(ip, true)).toBe(true);
		}
	});

	it("lets a private host through once the webhook allows one", () => {
		for (const ip of [
			"10.0.0.1",
			"100.64.0.1",
			"192.0.2.1",
			"fd00::1",
			"fd00:ec2::253",
			"64:ff9b::a00:1",
			"2002:a00:1::",
		])
			expect(isBlockedAddress(ip, true)).toBe(false);
	});

	it("blocks anything it cannot parse", () => {
		for (const ip of [
			"",
			"not-an-address",
			"1.2.3",
			"::ffff:zzzz:1",
			"1::2::3",
		])
			expect(isBlockedAddress(ip)).toBe(true);
	});
});

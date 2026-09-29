import { MARKDOWN_LINKS } from "@/lib/markdown-negotiation";

export function landingMarkdown(): string {
	return `# Reloop CRM

Win back old customers.

Reloop reads the mailbox you already have. And tells you which old customers you should call.

## Your mailbox is enough

Connect Gmail, Outlook or any IMAP mailbox. Reloop sends no mail. It reads along, scores every thread point by point and puts a draft in front of you. Sending stays with you.

## 178 old customers. Worth a call.

Measured in one real installation: 13,821 threads read, 15,885 messages, 2,691 people, 2,537 companies. 64.5% of the threads held nothing for the business.

## It reads. You decide.

### Reads only. Never sends.

Reloop has read access only. No mail goes out without you.

### Value, point by point.

Every point stands on its own. You check it yourself.

### A draft, not a send.

Reloop writes the draft. Sending stays with you.

## Try it on your own mailbox.

14 days free, no card. From 39 € a month after that. See the plans at https://reloopcrm.com/pricing.

## Where to go next

${MARKDOWN_LINKS}
`;
}

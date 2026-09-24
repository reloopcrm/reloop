import { LOCALE, type Locale } from "@crm/db/locale";
import type { Mail } from "./mail.service";
import { escapeHtml, fill, mailHtml } from "./mail-copy";

export const BILLING_MAIL_KINDS = [
	"paid",
	"failed",
	"ending",
	"ended",
	"unpaid",
	"trialEnding",
	"trialEnded",
] as const;

export type BillingMailKind = (typeof BILLING_MAIL_KINDS)[number];

const BILLING_MAIL_LINKS = ["invoice", "pdf", "billing"] as const;

type BillingMailLink = (typeof BILLING_MAIL_LINKS)[number];

type Copy = { subject: string; lines: readonly string[] };

type Wording = {
	greeting: string;
	links: Record<BillingMailLink, string>;
	kinds: Record<BillingMailKind, Copy>;
};

const LINKS_OF = {
	paid: ["invoice", "pdf"],
	failed: ["invoice", "billing"],
	ending: ["billing"],
	ended: ["billing"],
	unpaid: ["billing"],
	trialEnding: ["billing"],
	trialEnded: ["billing"],
} as const satisfies Record<BillingMailKind, readonly BillingMailLink[]>;

const COPY = {
	en: {
		greeting: "Hello,",
		links: {
			invoice: "View the invoice",
			pdf: "Download the invoice as PDF",
			billing: "Open plan and billing",
		},
		kinds: {
			paid: {
				subject: "Your Reloop plan {plan} is active",
				lines: [
					"Thank you. Your plan {plan} is active.",
					"Your invoice is linked below.",
				],
			},
			failed: {
				subject: "Reloop: a payment failed",
				lines: [
					"Stripe could not collect {amount} for your plan {plan}.",
					"Pay the open invoice or change your payment method.",
					"If the invoice is still open after {date}, your workspace pauses.",
				],
			},
			ending: {
				subject: "Reloop: your plan ends on {date}",
				lines: [
					"Your plan {plan} ends on {date}. Nothing renews after that.",
					"Then your workspace pauses, and {days} days later all its data is deleted for good.",
					"You can keep your plan until then.",
				],
			},
			ended: {
				subject: "Reloop: your plan has ended",
				lines: [
					"Your plan has ended, and your workspace is paused.",
					"Choose a plan to open it again.",
					"After {date}, all its data is deleted for good.",
				],
			},
			unpaid: {
				subject: "Reloop: your workspace is paused",
				lines: [
					"Your workspace is paused, because an invoice is still open.",
					"Pay it or change your payment method to open the workspace again.",
					"After {date}, all its data is deleted for good.",
				],
			},
			trialEnding: {
				subject: "Reloop: your trial ends on {date}",
				lines: [
					"Your trial ends on {date}.",
					"Choose a plan to keep working without a break. Paying ends the trial, and billing starts that day.",
					"Without a plan, your workspace pauses when the trial ends.",
				],
			},
			trialEnded: {
				subject: "Reloop: your trial has ended",
				lines: [
					"Your trial has ended, and your workspace is paused.",
					"Choose a plan to open it again.",
					"After {date}, all its data is deleted for good.",
				],
			},
		},
	},
	de: {
		greeting: "Hallo,",
		links: {
			invoice: "Rechnung ansehen",
			pdf: "Rechnung als PDF herunterladen",
			billing: "Tarif und Abrechnung öffnen",
		},
		kinds: {
			paid: {
				subject: "Dein Reloop Tarif {plan} ist aktiv",
				lines: [
					"Danke. Dein Tarif {plan} ist aktiv.",
					"Deine Rechnung findest du unten.",
				],
			},
			failed: {
				subject: "Reloop: Eine Zahlung ist fehlgeschlagen",
				lines: [
					"Stripe konnte {amount} für deinen Tarif {plan} nicht einziehen.",
					"Bezahle die offene Rechnung oder ändere deine Zahlungsmethode.",
					"Ist die Rechnung nach dem {date} noch offen, pausiert dein Workspace.",
				],
			},
			ending: {
				subject: "Reloop: Dein Tarif endet am {date}",
				lines: [
					"Dein Tarif {plan} endet am {date}. Danach verlängert sich nichts.",
					"Dann pausiert dein Workspace, und {days} Tage später werden alle Daten endgültig gelöscht.",
					"Bis dahin kannst du deinen Tarif behalten.",
				],
			},
			ended: {
				subject: "Reloop: Dein Tarif ist beendet",
				lines: [
					"Dein Tarif ist beendet, und dein Workspace ist pausiert.",
					"Wähle einen Tarif, um ihn wieder zu öffnen.",
					"Nach dem {date} werden alle Daten endgültig gelöscht.",
				],
			},
			unpaid: {
				subject: "Reloop: Dein Workspace ist pausiert",
				lines: [
					"Dein Workspace ist pausiert, weil eine Rechnung noch offen ist.",
					"Bezahle sie oder ändere deine Zahlungsmethode, um den Workspace wieder zu öffnen.",
					"Nach dem {date} werden alle Daten endgültig gelöscht.",
				],
			},
			trialEnding: {
				subject: "Reloop: Deine Testphase endet am {date}",
				lines: [
					"Deine Testphase endet am {date}.",
					"Wähle einen Tarif, um ohne Pause weiterzuarbeiten. Mit der Zahlung endet die Testphase, und die Abrechnung beginnt an diesem Tag.",
					"Ohne Tarif pausiert dein Workspace, wenn die Testphase endet.",
				],
			},
			trialEnded: {
				subject: "Reloop: Deine Testphase ist beendet",
				lines: [
					"Deine Testphase ist beendet, und dein Workspace ist pausiert.",
					"Wähle einen Tarif, um ihn wieder zu öffnen.",
					"Nach dem {date} werden alle Daten endgültig gelöscht.",
				],
			},
		},
	},
	es: {
		greeting: "Hola,",
		links: {
			invoice: "Ver la factura",
			pdf: "Descargar la factura en PDF",
			billing: "Abrir plan y facturación",
		},
		kinds: {
			paid: {
				subject: "Tu plan de Reloop {plan} está activo",
				lines: [
					"Gracias. Tu plan {plan} está activo.",
					"Abajo tienes el enlace a tu factura.",
				],
			},
			failed: {
				subject: "Reloop: un pago ha fallado",
				lines: [
					"Stripe no pudo cobrar {amount} por tu plan {plan}.",
					"Paga la factura pendiente o cambia tu método de pago.",
					"Si la factura sigue pendiente después del {date}, tu espacio de trabajo se pausa.",
				],
			},
			ending: {
				subject: "Reloop: tu plan termina el {date}",
				lines: [
					"Tu plan {plan} termina el {date}. Después no se renueva nada.",
					"Entonces tu espacio de trabajo se pausa, y {days} días después todos sus datos se borran para siempre.",
					"Hasta entonces puedes conservar tu plan.",
				],
			},
			ended: {
				subject: "Reloop: tu plan ha terminado",
				lines: [
					"Tu plan ha terminado y tu espacio de trabajo está en pausa.",
					"Elige un plan para abrirlo de nuevo.",
					"Después del {date}, todos sus datos se borran para siempre.",
				],
			},
			unpaid: {
				subject: "Reloop: tu espacio de trabajo está en pausa",
				lines: [
					"Tu espacio de trabajo está en pausa porque una factura sigue pendiente.",
					"Págala o cambia tu método de pago para abrir el espacio de trabajo de nuevo.",
					"Después del {date}, todos sus datos se borran para siempre.",
				],
			},
			trialEnding: {
				subject: "Reloop: tu prueba termina el {date}",
				lines: [
					"Tu prueba termina el {date}.",
					"Elige un plan para seguir trabajando sin pausa. Al pagar termina la prueba y la facturación empieza ese día.",
					"Sin un plan, tu espacio de trabajo se pausa cuando termina la prueba.",
				],
			},
			trialEnded: {
				subject: "Reloop: tu prueba ha terminado",
				lines: [
					"Tu prueba ha terminado y tu espacio de trabajo está en pausa.",
					"Elige un plan para abrirlo de nuevo.",
					"Después del {date}, todos sus datos se borran para siempre.",
				],
			},
		},
	},
	fr: {
		greeting: "Bonjour,",
		links: {
			invoice: "Voir la facture",
			pdf: "Télécharger la facture en PDF",
			billing: "Ouvrir le forfait et la facturation",
		},
		kinds: {
			paid: {
				subject: "Ton forfait Reloop {plan} est actif",
				lines: [
					"Merci. Ton forfait {plan} est actif.",
					"Le lien vers ta facture est ci-dessous.",
				],
			},
			failed: {
				subject: "Reloop : un paiement a échoué",
				lines: [
					"Stripe n'a pas pu prélever {amount} pour ton forfait {plan}.",
					"Paie la facture ouverte ou change ton moyen de paiement.",
					"Si la facture est encore ouverte après le {date}, ton espace de travail est mis en pause.",
				],
			},
			ending: {
				subject: "Reloop : ton forfait se termine le {date}",
				lines: [
					"Ton forfait {plan} se termine le {date}. Rien ne se renouvelle ensuite.",
					"Ton espace de travail est alors mis en pause, et {days} jours plus tard toutes ses données sont supprimées définitivement.",
					"Tu peux garder ton forfait jusque-là.",
				],
			},
			ended: {
				subject: "Reloop : ton forfait est terminé",
				lines: [
					"Ton forfait est terminé, et ton espace de travail est en pause.",
					"Choisis un forfait pour le rouvrir.",
					"Après le {date}, toutes ses données sont supprimées définitivement.",
				],
			},
			unpaid: {
				subject: "Reloop : ton espace de travail est en pause",
				lines: [
					"Ton espace de travail est en pause, car une facture est encore ouverte.",
					"Paie-la ou change ton moyen de paiement pour rouvrir l'espace de travail.",
					"Après le {date}, toutes ses données sont supprimées définitivement.",
				],
			},
			trialEnding: {
				subject: "Reloop : ton essai se termine le {date}",
				lines: [
					"Ton essai se termine le {date}.",
					"Choisis un forfait pour continuer sans interruption. Le paiement met fin à l'essai, et la facturation commence ce jour-là.",
					"Sans forfait, ton espace de travail est mis en pause à la fin de l'essai.",
				],
			},
			trialEnded: {
				subject: "Reloop : ton essai est terminé",
				lines: [
					"Ton essai est terminé, et ton espace de travail est en pause.",
					"Choisis un forfait pour le rouvrir.",
					"Après le {date}, toutes ses données sont supprimées définitivement.",
				],
			},
		},
	},
	"pt-BR": {
		greeting: "Olá,",
		links: {
			invoice: "Ver a fatura",
			pdf: "Baixar a fatura em PDF",
			billing: "Abrir plano e cobrança",
		},
		kinds: {
			paid: {
				subject: "Seu plano Reloop {plan} está ativo",
				lines: [
					"Obrigado. Seu plano {plan} está ativo.",
					"O link da sua fatura está abaixo.",
				],
			},
			failed: {
				subject: "Reloop: um pagamento falhou",
				lines: [
					"O Stripe não conseguiu cobrar {amount} pelo seu plano {plan}.",
					"Pague a fatura em aberto ou altere sua forma de pagamento.",
					"Se a fatura ainda estiver em aberto depois de {date}, seu workspace é pausado.",
				],
			},
			ending: {
				subject: "Reloop: seu plano termina em {date}",
				lines: [
					"Seu plano {plan} termina em {date}. Depois disso nada é renovado.",
					"Então seu workspace é pausado, e {days} dias depois todos os dados são apagados para sempre.",
					"Até lá você pode manter seu plano.",
				],
			},
			ended: {
				subject: "Reloop: seu plano terminou",
				lines: [
					"Seu plano terminou, e seu workspace está pausado.",
					"Escolha um plano para abri-lo de novo.",
					"Depois de {date}, todos os dados são apagados para sempre.",
				],
			},
			unpaid: {
				subject: "Reloop: seu workspace está pausado",
				lines: [
					"Seu workspace está pausado porque uma fatura ainda está em aberto.",
					"Pague a fatura ou altere sua forma de pagamento para abrir o workspace de novo.",
					"Depois de {date}, todos os dados são apagados para sempre.",
				],
			},
			trialEnding: {
				subject: "Reloop: seu teste termina em {date}",
				lines: [
					"Seu teste termina em {date}.",
					"Escolha um plano para continuar sem pausa. O pagamento encerra o teste, e a cobrança começa nesse dia.",
					"Sem um plano, seu workspace é pausado quando o teste termina.",
				],
			},
			trialEnded: {
				subject: "Reloop: seu teste terminou",
				lines: [
					"Seu teste terminou, e seu workspace está pausado.",
					"Escolha um plano para abri-lo de novo.",
					"Depois de {date}, todos os dados são apagados para sempre.",
				],
			},
		},
	},
	tr: {
		greeting: "Merhaba,",
		links: {
			invoice: "Faturayı görüntüle",
			pdf: "Faturayı PDF olarak indir",
			billing: "Plan ve faturalandırmayı aç",
		},
		kinds: {
			paid: {
				subject: "Reloop planın {plan} etkin",
				lines: [
					"Teşekkürler. {plan} planın etkin.",
					"Faturanın bağlantısı aşağıda.",
				],
			},
			failed: {
				subject: "Reloop: bir ödeme başarısız oldu",
				lines: [
					"Stripe {plan} planın için {amount} tutarını tahsil edemedi.",
					"Açık faturayı öde ya da ödeme yöntemini değiştir.",
					"Fatura {date} tarihinden sonra hâlâ açıksa çalışma alanın duraklatılır.",
				],
			},
			ending: {
				subject: "Reloop: planın {date} tarihinde bitiyor",
				lines: [
					"{plan} planın {date} tarihinde bitiyor. Bundan sonra hiçbir şey yenilenmez.",
					"Ardından çalışma alanın duraklatılır ve {days} gün sonra tüm verileri kalıcı olarak silinir.",
					"O zamana kadar planını koruyabilirsin.",
				],
			},
			ended: {
				subject: "Reloop: planın sona erdi",
				lines: [
					"Planın sona erdi ve çalışma alanın duraklatıldı.",
					"Yeniden açmak için bir plan seç.",
					"{date} tarihinden sonra tüm verileri kalıcı olarak silinir.",
				],
			},
			unpaid: {
				subject: "Reloop: çalışma alanın duraklatıldı",
				lines: [
					"Bir fatura hâlâ açık olduğu için çalışma alanın duraklatıldı.",
					"Çalışma alanını yeniden açmak için faturayı öde ya da ödeme yöntemini değiştir.",
					"{date} tarihinden sonra tüm verileri kalıcı olarak silinir.",
				],
			},
			trialEnding: {
				subject: "Reloop: deneme süren {date} tarihinde bitiyor",
				lines: [
					"Deneme süren {date} tarihinde bitiyor.",
					"Ara vermeden çalışmaya devam etmek için bir plan seç. Ödeme deneme süresini bitirir ve faturalandırma o gün başlar.",
					"Plan seçmezsen çalışma alanın deneme süresi bitince duraklatılır.",
				],
			},
			trialEnded: {
				subject: "Reloop: deneme süren sona erdi",
				lines: [
					"Deneme süren sona erdi ve çalışma alanın duraklatıldı.",
					"Yeniden açmak için bir plan seç.",
					"{date} tarihinden sonra tüm verileri kalıcı olarak silinir.",
				],
			},
		},
	},
	"zh-Hans": {
		greeting: "你好，",
		links: {
			invoice: "查看发票",
			pdf: "下载 PDF 发票",
			billing: "打开套餐与账单",
		},
		kinds: {
			paid: {
				subject: "你的 Reloop 套餐 {plan} 已生效",
				lines: ["谢谢。你的套餐 {plan} 已生效。", "发票链接在下方。"],
			},
			failed: {
				subject: "Reloop：一笔付款失败",
				lines: [
					"Stripe 无法为你的套餐 {plan} 收取 {amount}。",
					"请支付未结发票或更换付款方式。",
					"如果发票在 {date} 之后仍未支付，你的工作区将被暂停。",
				],
			},
			ending: {
				subject: "Reloop：你的套餐将于 {date} 结束",
				lines: [
					"你的套餐 {plan} 将于 {date} 结束。之后不会续订。",
					"届时你的工作区将被暂停，{days} 天后其所有数据将被永久删除。",
					"在此之前你可以保留你的套餐。",
				],
			},
			ended: {
				subject: "Reloop：你的套餐已结束",
				lines: [
					"你的套餐已结束，你的工作区已暂停。",
					"选择一个套餐即可重新打开。",
					"{date} 之后，其所有数据将被永久删除。",
				],
			},
			unpaid: {
				subject: "Reloop：你的工作区已暂停",
				lines: [
					"由于一张发票仍未支付，你的工作区已暂停。",
					"支付发票或更换付款方式即可重新打开工作区。",
					"{date} 之后，其所有数据将被永久删除。",
				],
			},
			trialEnding: {
				subject: "Reloop：你的试用将于 {date} 结束",
				lines: [
					"你的试用将于 {date} 结束。",
					"选择一个套餐即可不间断地继续工作。付款即结束试用，当天开始计费。",
					"如果没有套餐，试用结束时你的工作区将被暂停。",
				],
			},
			trialEnded: {
				subject: "Reloop：你的试用已结束",
				lines: [
					"你的试用已结束，你的工作区已暂停。",
					"选择一个套餐即可重新打开。",
					"{date} 之后，其所有数据将被永久删除。",
				],
			},
		},
	},
} satisfies Record<Locale, Wording>;

export type MailAmount = { value: number; currency: string };

export type BillingMailDetails = {
	plan?: string | null;
	amount?: MailAmount | null;
	date?: Date | null;
	days?: number | null;
	invoiceUrl?: string | null;
	pdfUrl?: string | null;
	billingUrl: string;
};

export type BillingMailInput = BillingMailDetails & {
	to: string;
	locale: Locale;
	kind: BillingMailKind;
};

type MailVars = { plan: string; amount: string; date: string; days: string };

const PLACEHOLDER = /\{(\w+)\}/g;

function varsOf(input: BillingMailInput): MailVars {
	const tag = LOCALE.tags[input.locale];
	return {
		plan: input.plan ?? "",
		date: input.date
			? new Intl.DateTimeFormat(tag, {
					dateStyle: "long",
					timeZone: "UTC",
				}).format(input.date)
			: "",
		amount: input.amount
			? new Intl.NumberFormat(tag, {
					style: "currency",
					currency: input.amount.currency,
				}).format(input.amount.value)
			: "",
		days:
			input.days === null || input.days === undefined ? "" : String(input.days),
	};
}

function complete(text: string, vars: MailVars): boolean {
	return [...text.matchAll(PLACEHOLDER)].every(
		([, key]) =>
			key !== undefined && key in vars && vars[key as keyof MailVars] !== "",
	);
}

function linkUrl(
	link: BillingMailLink,
	input: BillingMailInput,
): string | null {
	if (link === "invoice") return input.invoiceUrl ?? null;
	if (link === "pdf") return input.pdfUrl ?? null;
	return input.billingUrl;
}

export function billingMail(input: BillingMailInput): Mail {
	const wording: Wording = COPY[input.locale];
	const copy = wording.kinds[input.kind];
	const vars = varsOf(input);
	const lines = copy.lines
		.filter((line) => complete(line, vars))
		.map((line) => fill(line, vars));
	const links = LINKS_OF[input.kind].flatMap((link) => {
		const url = linkUrl(link, input);
		return url ? [{ label: wording.links[link], url }] : [];
	});

	return {
		to: input.to,
		subject: fill(copy.subject, vars),
		text: [
			wording.greeting,
			"",
			...lines,
			"",
			...links.map((link) => `${link.label}: ${link.url}`),
		].join("\n"),
		html: mailHtml([
			`<p>${escapeHtml(wording.greeting)}</p>`,
			...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
			...links.map(
				(link) =>
					`<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
			),
		]),
	};
}

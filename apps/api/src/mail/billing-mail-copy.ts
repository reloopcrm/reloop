import { LOCALE, type Locale } from "@crm/db/locale";
import { ADD_ON_IDS, type AddOnId, type AddOnQuantities } from "@crm/db/plans";
import type { BillingInterval } from "@crm/db/pricing";
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
	"scheduled",
	"unscheduled",
	"deleted",
] as const;

export type BillingMailKind = (typeof BILLING_MAIL_KINDS)[number];

const BILLING_MAIL_LINKS = ["invoice", "pdf", "billing"] as const;

type BillingMailLink = (typeof BILLING_MAIL_LINKS)[number];

type Copy = { subject: string; lines: readonly string[] };

type Wording = {
	greeting: string;
	links: Record<BillingMailLink, string>;
	intervals: Record<BillingInterval, string>;
	addOns: Record<AddOnId, string>;
	addOnCount: string;
	noAddOns: string;
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
	scheduled: ["billing"],
	unscheduled: ["billing"],
	deleted: [],
} as const satisfies Record<BillingMailKind, readonly BillingMailLink[]>;

const COPY = {
	en: {
		greeting: "Hello,",
		intervals: { month: "monthly", year: "yearly" },
		addOns: {
			conversations: "1,000 mail conversations",
			drafts: "100 mail drafts",
			research: "50 company research runs",
			mailbox: "1 extra mailbox per month",
		},
		addOnCount: "{label}: {count}",
		noAddOns: "none",
		links: {
			invoice: "View the invoice",
			pdf: "Download the invoice as PDF",
			billing: "Open plan and billing",
		},
		kinds: {
			paid: {
				subject: "Your Reloop plan {plan} is active",
				lines: ["Thank you. Your plan {plan} is active."],
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
			scheduled: {
				subject: "Reloop: your plan changes on {date}",
				lines: [
					"From {date}, your plan is {plan}, billed {interval}.",
					"Add-ons from then on: {addOns}.",
					"Until then your current plan and its limits stay as they are. Nothing is charged now.",
					"You can undo this under plan and billing until {date}.",
				],
			},
			unscheduled: {
				subject: "Reloop: your scheduled change is withdrawn",
				lines: [
					"The change planned for {date} is withdrawn.",
					"Your plan {plan} and its add-ons stay as they are.",
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
			deleted: {
				subject: "Reloop: your workspace was deleted",
				lines: [
					"Your workspace was deleted, as you asked.",
					"All contacts, companies, mails, deals, notes and agents are gone, and your mailboxes are disconnected.",
					"Your subscription is cancelled. Nothing is charged again.",
					"Backups are deleted after {days} days at the latest.",
				],
			},
		},
	},
	de: {
		greeting: "Hallo,",
		intervals: { month: "monatlich", year: "jährlich" },
		addOns: {
			conversations: "1.000 Mail-Unterhaltungen",
			drafts: "100 Mail-Entwürfe",
			research: "50 Firmen-Recherchen",
			mailbox: "1 Postfach extra pro Monat",
		},
		addOnCount: "{label}: {count}",
		noAddOns: "keine",
		links: {
			invoice: "Rechnung ansehen",
			pdf: "Rechnung als PDF herunterladen",
			billing: "Tarif und Abrechnung öffnen",
		},
		kinds: {
			paid: {
				subject: "Dein Reloop Tarif {plan} ist aktiv",
				lines: ["Danke. Dein Tarif {plan} ist aktiv."],
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
			scheduled: {
				subject: "Reloop: Dein Tarif ändert sich am {date}",
				lines: [
					"Ab dem {date} ist dein Tarif {plan}, {interval} abgerechnet.",
					"Add-ons ab dann: {addOns}.",
					"Bis dahin bleiben dein jetziger Tarif und seine Grenzen, wie sie sind. Jetzt wird nichts berechnet.",
					"Bis zum {date} kannst du den Wechsel unter Tarif und Abrechnung zurücknehmen.",
				],
			},
			unscheduled: {
				subject: "Reloop: Geplanter Wechsel zurückgenommen",
				lines: [
					"Der Wechsel, der für den {date} geplant war, ist zurückgenommen.",
					"Dein Tarif {plan} und seine Add-ons bleiben, wie sie sind.",
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
			deleted: {
				subject: "Reloop: Dein Workspace wurde gelöscht",
				lines: [
					"Dein Workspace wurde gelöscht, so wie du es wolltest.",
					"Alle Kontakte, Firmen, Mails, Deals, Notizen und Agenten sind entfernt, und deine Postfächer sind getrennt.",
					"Dein Abo ist gekündigt. Es wird nichts mehr berechnet.",
					"Sicherungen werden spätestens nach {days} Tagen gelöscht.",
				],
			},
		},
	},
	es: {
		greeting: "Hola,",
		intervals: { month: "mensualmente", year: "anualmente" },
		addOns: {
			conversations: "1.000 conversaciones de correo",
			drafts: "100 borradores de correo",
			research: "50 investigaciones de empresas",
			mailbox: "1 buzón extra al mes",
		},
		addOnCount: "{label}: {count}",
		noAddOns: "ninguno",
		links: {
			invoice: "Ver la factura",
			pdf: "Descargar la factura en PDF",
			billing: "Abrir plan y facturación",
		},
		kinds: {
			paid: {
				subject: "Tu plan de Reloop {plan} está activo",
				lines: ["Gracias. Tu plan {plan} está activo."],
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
			scheduled: {
				subject: "Reloop: tu plan cambia el {date}",
				lines: [
					"A partir del {date}, tu plan es {plan}, facturado {interval}.",
					"Complementos a partir de entonces: {addOns}.",
					"Hasta entonces, tu plan actual y sus límites se mantienen. Ahora no se cobra nada.",
					"Puedes deshacer el cambio en plan y facturación hasta el {date}.",
				],
			},
			unscheduled: {
				subject: "Reloop: tu cambio programado está anulado",
				lines: [
					"El cambio previsto para el {date} está anulado.",
					"Tu plan {plan} y sus complementos se mantienen como están.",
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
			deleted: {
				subject: "Reloop: tu espacio de trabajo se ha eliminado",
				lines: [
					"Tu espacio de trabajo se ha eliminado, como pediste.",
					"Todos los contactos, empresas, correos, oportunidades, notas y agentes se han borrado, y tus buzones están desconectados.",
					"Tu suscripción está cancelada. No se cobra nada más.",
					"Las copias de seguridad se borran como muy tarde después de {days} días.",
				],
			},
		},
	},
	fr: {
		greeting: "Bonjour,",
		intervals: { month: "mensuellement", year: "annuellement" },
		addOns: {
			conversations: "1 000 conversations mail",
			drafts: "100 brouillons de mail",
			research: "50 recherches d'entreprises",
			mailbox: "1 boîte mail en plus par mois",
		},
		addOnCount: "{label} : {count}",
		noAddOns: "aucune",
		links: {
			invoice: "Voir la facture",
			pdf: "Télécharger la facture en PDF",
			billing: "Ouvrir le forfait et la facturation",
		},
		kinds: {
			paid: {
				subject: "Ton forfait Reloop {plan} est actif",
				lines: ["Merci. Ton forfait {plan} est actif."],
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
			scheduled: {
				subject: "Reloop : ton forfait change le {date}",
				lines: [
					"À partir du {date}, ton forfait est {plan}, facturé {interval}.",
					"Options à partir de là : {addOns}.",
					"D'ici là, ton forfait actuel et ses limites restent inchangés. Rien n'est facturé maintenant.",
					"Tu peux annuler ce changement dans le forfait et la facturation jusqu'au {date}.",
				],
			},
			unscheduled: {
				subject: "Reloop : ton changement prévu est annulé",
				lines: [
					"Le changement prévu pour le {date} est annulé.",
					"Ton forfait {plan} et ses options restent inchangés.",
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
			deleted: {
				subject: "Reloop : ton espace de travail a été supprimé",
				lines: [
					"Ton espace de travail a été supprimé, comme tu l'as demandé.",
					"Tous les contacts, entreprises, mails, affaires, notes et agents sont supprimés, et tes boîtes mail sont déconnectées.",
					"Ton abonnement est résilié. Plus rien n'est facturé.",
					"Les sauvegardes sont supprimées au plus tard après {days} jours.",
				],
			},
		},
	},
	"pt-BR": {
		greeting: "Olá,",
		intervals: { month: "mensalmente", year: "anualmente" },
		addOns: {
			conversations: "1.000 conversas de e-mail",
			drafts: "100 rascunhos de e-mail",
			research: "50 pesquisas de empresas",
			mailbox: "1 caixa de e-mail extra por mês",
		},
		addOnCount: "{label}: {count}",
		noAddOns: "nenhum",
		links: {
			invoice: "Ver a fatura",
			pdf: "Baixar a fatura em PDF",
			billing: "Abrir plano e cobrança",
		},
		kinds: {
			paid: {
				subject: "Seu plano Reloop {plan} está ativo",
				lines: ["Obrigado. Seu plano {plan} está ativo."],
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
			scheduled: {
				subject: "Reloop: seu plano muda em {date}",
				lines: [
					"A partir de {date}, seu plano é {plan}, cobrado {interval}.",
					"Complementos a partir de então: {addOns}.",
					"Até lá, seu plano atual e seus limites continuam como estão. Nada é cobrado agora.",
					"Você pode desfazer a mudança em plano e cobrança até {date}.",
				],
			},
			unscheduled: {
				subject: "Reloop: sua mudança agendada foi desfeita",
				lines: [
					"A mudança prevista para {date} foi desfeita.",
					"Seu plano {plan} e seus complementos continuam como estão.",
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
			deleted: {
				subject: "Reloop: seu workspace foi excluído",
				lines: [
					"Seu workspace foi excluído, como você pediu.",
					"Todos os contatos, empresas, e-mails, negócios, notas e agentes foram apagados, e suas caixas de e-mail foram desconectadas.",
					"Sua assinatura foi cancelada. Nada mais é cobrado.",
					"Os backups são apagados no máximo depois de {days} dias.",
				],
			},
		},
	},
	tr: {
		greeting: "Merhaba,",
		intervals: { month: "aylık", year: "yıllık" },
		addOns: {
			conversations: "1.000 e-posta konuşması",
			drafts: "100 e-posta taslağı",
			research: "50 şirket araştırması",
			mailbox: "aylık 1 ek posta kutusu",
		},
		addOnCount: "{label}: {count}",
		noAddOns: "yok",
		links: {
			invoice: "Faturayı görüntüle",
			pdf: "Faturayı PDF olarak indir",
			billing: "Plan ve faturalandırmayı aç",
		},
		kinds: {
			paid: {
				subject: "Reloop planın {plan} etkin",
				lines: ["Teşekkürler. {plan} planın etkin."],
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
			scheduled: {
				subject: "Reloop: planın {date} tarihinde değişiyor",
				lines: [
					"{date} itibarıyla planın {plan} olur ve {interval} faturalanır.",
					"O tarihten itibaren eklentiler: {addOns}.",
					"O zamana kadar mevcut planın ve sınırların olduğu gibi kalır. Şimdi hiçbir ücret alınmaz.",
					"{date} tarihine kadar değişikliği plan ve faturalandırma altında geri alabilirsin.",
				],
			},
			unscheduled: {
				subject: "Reloop: planlanan değişiklik geri alındı",
				lines: [
					"{date} için planlanan değişiklik geri alındı.",
					"{plan} planın ve eklentilerin olduğu gibi kalır.",
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
			deleted: {
				subject: "Reloop: çalışma alanın silindi",
				lines: [
					"Çalışma alanın istediğin gibi silindi.",
					"Tüm kişiler, şirketler, e-postalar, fırsatlar, notlar ve ajanlar silindi ve posta kutularının bağlantısı kesildi.",
					"Aboneliğin iptal edildi. Artık hiçbir ücret alınmaz.",
					"Yedekler en geç {days} gün sonra silinir.",
				],
			},
		},
	},
	"zh-Hans": {
		greeting: "你好，",
		intervals: { month: "按月", year: "按年" },
		addOns: {
			conversations: "1,000 个邮件会话",
			drafts: "100 封邮件草稿",
			research: "50 次公司调研",
			mailbox: "每月额外 1 个邮箱",
		},
		addOnCount: "{label}：{count}",
		noAddOns: "无",
		links: {
			invoice: "查看发票",
			pdf: "下载 PDF 发票",
			billing: "打开套餐与账单",
		},
		kinds: {
			paid: {
				subject: "你的 Reloop 套餐 {plan} 已生效",
				lines: ["谢谢。你的套餐 {plan} 已生效。"],
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
			scheduled: {
				subject: "Reloop：你的套餐将于 {date} 变更",
				lines: [
					"自 {date} 起，你的套餐为 {plan}，{interval}计费。",
					"届时的附加包：{addOns}。",
					"在此之前，你当前的套餐及其限额保持不变。现在不会产生任何费用。",
					"在 {date} 之前，你可以在套餐与账单中撤销此变更。",
				],
			},
			unscheduled: {
				subject: "Reloop：计划中的变更已撤销",
				lines: [
					"原定于 {date} 的变更已撤销。",
					"你的套餐 {plan} 及其附加包保持不变。",
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
			deleted: {
				subject: "Reloop：你的工作区已删除",
				lines: [
					"你的工作区已按你的要求删除。",
					"所有联系人、公司、邮件、交易、备注和智能体都已删除，你的邮箱已断开连接。",
					"你的订阅已取消。之后不会再收取任何费用。",
					"备份最迟在 {days} 天后删除。",
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
	interval?: BillingInterval | null;
	addOns?: AddOnQuantities | null;
	invoiceUrl?: string | null;
	pdfUrl?: string | null;
	billingUrl: string;
};

export type BillingMailInput = BillingMailDetails & {
	to: string;
	locale: Locale;
	kind: BillingMailKind;
};

type MailVars = {
	plan: string;
	amount: string;
	date: string;
	days: string;
	interval: string;
	addOns: string;
};

const PLACEHOLDER = /\{(\w+)\}/g;

function varsOf(input: BillingMailInput, wording: Wording): MailVars {
	const tag = LOCALE.tags[input.locale];
	return {
		plan: input.plan ?? "",
		interval: input.interval ? wording.intervals[input.interval] : "",
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
		addOns: input.addOns ? addOnList(input.addOns, wording) : "",
	};
}

function addOnList(addOns: AddOnQuantities, wording: Wording): string {
	const listed = ADD_ON_IDS.filter((id) => addOns[id] > 0).map((id) =>
		fill(wording.addOnCount, {
			label: wording.addOns[id],
			count: String(addOns[id]),
		}),
	);
	return listed.length > 0 ? listed.join(", ") : wording.noAddOns;
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
	const vars = varsOf(input, wording);
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

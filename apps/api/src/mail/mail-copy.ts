import type { Locale } from "@crm/db/locale";
import type { TenantCodePurpose } from "@crm/db/tenant-codes";
import type { Mail } from "./mail.service";

type Copy = {
	subject: string;
	greeting: string;
	lead: string;
	validity: string;
	ignore: string;
};

type Wording = Record<TenantCodePurpose, Copy>;

const COPY = {
	en: {
		signup: {
			subject: "Your Reloop code: {code}",
			greeting: "Hello {name},",
			lead: "Enter this code to open your workspace:",
			validity: "The code is valid for {minutes} minutes.",
			ignore: "You did not sign up? Then ignore this mail.",
		},
		reset: {
			subject: "Your Reloop code: {code}",
			greeting: "Hello,",
			lead: "Enter this code to set a new password:",
			validity: "The code is valid for {minutes} minutes.",
			ignore:
				"You did not ask for a new password? Then ignore this mail. Your password stays as it is.",
		},
	},
	de: {
		signup: {
			subject: "Dein Reloop Code: {code}",
			greeting: "Hallo {name},",
			lead: "Gib diesen Code ein, um deinen Workspace zu öffnen:",
			validity: "Der Code gilt {minutes} Minuten.",
			ignore: "Du hast dich nicht registriert? Dann ignoriere diese Mail.",
		},
		reset: {
			subject: "Dein Reloop Code: {code}",
			greeting: "Hallo,",
			lead: "Gib diesen Code ein, um ein neues Passwort zu setzen:",
			validity: "Der Code gilt {minutes} Minuten.",
			ignore:
				"Du hast kein neues Passwort angefordert? Dann ignoriere diese Mail. Dein Passwort bleibt, wie es ist.",
		},
	},
	es: {
		signup: {
			subject: "Tu código de Reloop: {code}",
			greeting: "Hola {name},",
			lead: "Introduce este código para abrir tu espacio de trabajo:",
			validity: "El código es válido durante {minutes} minutos.",
			ignore: "¿No te has registrado? Entonces ignora este correo.",
		},
		reset: {
			subject: "Tu código de Reloop: {code}",
			greeting: "Hola,",
			lead: "Introduce este código para establecer una nueva contraseña:",
			validity: "El código es válido durante {minutes} minutos.",
			ignore:
				"¿No has pedido una nueva contraseña? Entonces ignora este correo. Tu contraseña no cambia.",
		},
	},
	fr: {
		signup: {
			subject: "Ton code Reloop : {code}",
			greeting: "Bonjour {name},",
			lead: "Saisis ce code pour ouvrir ton espace de travail :",
			validity: "Le code est valable {minutes} minutes.",
			ignore: "Tu ne t'es pas inscrit ? Alors ignore ce mail.",
		},
		reset: {
			subject: "Ton code Reloop : {code}",
			greeting: "Bonjour,",
			lead: "Saisis ce code pour définir un nouveau mot de passe :",
			validity: "Le code est valable {minutes} minutes.",
			ignore:
				"Tu n'as pas demandé de nouveau mot de passe ? Alors ignore ce mail. Ton mot de passe reste inchangé.",
		},
	},
	"pt-BR": {
		signup: {
			subject: "Seu código Reloop: {code}",
			greeting: "Olá {name},",
			lead: "Digite este código para abrir seu workspace:",
			validity: "O código vale por {minutes} minutos.",
			ignore: "Você não se cadastrou? Então ignore este e-mail.",
		},
		reset: {
			subject: "Seu código Reloop: {code}",
			greeting: "Olá,",
			lead: "Digite este código para definir uma nova senha:",
			validity: "O código vale por {minutes} minutos.",
			ignore:
				"Você não pediu uma nova senha? Então ignore este e-mail. Sua senha continua a mesma.",
		},
	},
	tr: {
		signup: {
			subject: "Reloop kodun: {code}",
			greeting: "Merhaba {name},",
			lead: "Çalışma alanını açmak için bu kodu gir:",
			validity: "Kod {minutes} dakika geçerlidir.",
			ignore: "Kayıt olmadın mı? O zaman bu e-postayı yok say.",
		},
		reset: {
			subject: "Reloop kodun: {code}",
			greeting: "Merhaba,",
			lead: "Yeni bir şifre belirlemek için bu kodu gir:",
			validity: "Kod {minutes} dakika geçerlidir.",
			ignore:
				"Yeni bir şifre istemedin mi? O zaman bu e-postayı yok say. Şifren olduğu gibi kalır.",
		},
	},
	"zh-Hans": {
		signup: {
			subject: "你的 Reloop 验证码：{code}",
			greeting: "{name}，你好，",
			lead: "输入此验证码以打开你的工作区：",
			validity: "验证码 {minutes} 分钟内有效。",
			ignore: "你没有注册？那么请忽略这封邮件。",
		},
		reset: {
			subject: "你的 Reloop 验证码：{code}",
			greeting: "你好，",
			lead: "输入此验证码以设置新密码：",
			validity: "验证码 {minutes} 分钟内有效。",
			ignore: "你没有申请新密码？那么请忽略这封邮件。你的密码保持不变。",
		},
	},
} satisfies Record<Locale, Wording>;

export type CodeMailInput = {
	to: string;
	locale: Locale;
	purpose: TenantCodePurpose;
	code: string;
	name: string | null;
	minutes: number;
};

function fill(text: string, vars: Record<string, string>): string {
	return text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function codeMail(input: CodeMailInput): Mail {
	const copy = COPY[input.locale][input.purpose];
	const vars = {
		code: input.code,
		name: input.name ?? "",
		minutes: String(input.minutes),
	};
	const lines = [
		fill(copy.greeting, vars),
		"",
		fill(copy.lead, vars),
		"",
		input.code,
		"",
		fill(copy.validity, vars),
		fill(copy.ignore, vars),
	];
	const paragraphs = lines
		.filter((line) => line.length > 0)
		.map((line) =>
			line === input.code
				? `<p style="font-size:24px;letter-spacing:4px"><strong>${escapeHtml(line)}</strong></p>`
				: `<p>${escapeHtml(line)}</p>`,
		);

	return {
		to: input.to,
		subject: fill(copy.subject, vars),
		text: lines.join("\n"),
		html: `<!doctype html><html><body style="font-family:sans-serif">${paragraphs.join("")}</body></html>`,
	};
}

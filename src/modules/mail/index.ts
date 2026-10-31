export type Mail = { to: string; subject: string; text: string };
export type MailResult = { sent: boolean };

export type MailTransport = (mail: Mail) => Promise<MailResult>;

/** Без настроенной почты письмо не уходит: в разработке оно печатается в консоль сервера. */
const logTransport: MailTransport = async (mail) => {
  if (process.env.NODE_ENV === "production") {
    console.warn(`[mail] Почта не настроена, письмо для ${mail.to} не отправлено`);
    return { sent: false };
  }
  console.info(`[mail] Кому: ${mail.to}\nТема: ${mail.subject}\n${mail.text}`);
  return { sent: true };
};

/** Resend (https://resend.com): нужны RESEND_API_KEY и MAIL_FROM. С реальным ключом не проверялось. */
const resendTransport: MailTransport = async (mail) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Почтовый сервис ответил ${res.status}`);
  return { sent: true };
};

/** Подменяется в тестах. */
export const mailer: { transport: MailTransport | null } = { transport: null };

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const transport = mailer.transport ?? (mailConfigured() ? resendTransport : logTransport);
  try {
    return await transport(mail);
  } catch (e) {
    console.error("[mail] ошибка отправки", e instanceof Error ? e.message : e);
    return { sent: false };
  }
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

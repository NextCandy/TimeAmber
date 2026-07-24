import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const channelInput = z.object({
  channel: z.enum(["bark", "telegram", "smtp"]),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  bark: z
    .object({
      endpoint: z.string().url().max(300).optional(),
      key: z.string().min(1).max(200),
      sound: z.string().max(40).optional(),
      group: z.string().max(60).optional(),
    })
    .optional(),
  telegram: z
    .object({
      botToken: z.string().min(10).max(200),
      chatId: z.string().min(1).max(60),
    })
    .optional(),
  smtp: z
    .object({
      webhookUrl: z.string().max(500).optional(),
      host: z.string().max(200).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      username: z.string().max(200).optional(),
      password: z.string().max(500).optional(),
      from: z.string().email().max(200),
      to: z.string().email().max(200),
      secret: z.string().max(200).optional(),
    })
    .optional(),
});

export const sendNotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: z.infer<typeof channelInput>) => channelInput.parse(value))
  .handler(async ({ data }) => {
    if (data.channel === "bark") {
      if (!data.bark?.key) throw new Error("Bark key is not configured");
      const base = (data.bark.endpoint ?? "https://api.day.app").replace(/\/$/, "");
      const url = `${base}/${encodeURIComponent(data.bark.key)}/${encodeURIComponent(
        data.title,
      )}/${encodeURIComponent(data.body)}`;
      const params = new URLSearchParams();
      if (data.bark.sound) params.set("sound", data.bark.sound);
      if (data.bark.group) params.set("group", data.bark.group);
      const response = await fetch(params.size ? `${url}?${params}` : url);
      const text = await response.text();
      if (!response.ok) throw new Error(`Bark failed [${response.status}]: ${text.slice(0, 200)}`);
      return { ok: true, via: "bark" as const };
    }

    if (data.channel === "telegram") {
      if (!data.telegram?.botToken || !data.telegram.chatId) {
        throw new Error("Telegram bot token and chat ID are required");
      }
      const response = await fetch(
        `https://api.telegram.org/bot${data.telegram.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: data.telegram.chatId,
            text: `*${data.title}*\n${data.body}`,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        },
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Telegram failed [${response.status}]: ${text.slice(0, 200)}`);
      }
      return { ok: true, via: "telegram" as const };
    }

    if (data.channel === "smtp") {
      if (!data.smtp) throw new Error("SMTP is not configured");
      if (data.smtp.webhookUrl) {
        const response = await fetch(data.smtp.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(data.smtp.secret ? { "X-Notify-Secret": data.smtp.secret } : {}),
          },
          body: JSON.stringify({
            host: data.smtp.host,
            port: data.smtp.port,
            username: data.smtp.username,
            password: data.smtp.password,
            from: data.smtp.from,
            to: data.smtp.to,
            subject: data.title,
            text: data.body,
          }),
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`SMTP webhook failed [${response.status}]: ${text.slice(0, 200)}`);
        }
      } else {
        if (!data.smtp.host) throw new Error("SMTP host is not configured");
        const nodemailer = await import("nodemailer");
        const port = data.smtp.port ?? 465;
        const transport = nodemailer.createTransport({
          host: data.smtp.host,
          port,
          secure: port === 465,
          auth: data.smtp.username
            ? { user: data.smtp.username, pass: data.smtp.password ?? "" }
            : undefined,
        });
        await transport.sendMail({
          from: data.smtp.from,
          to: data.smtp.to,
          subject: data.title,
          text: data.body,
        });
      }
      return { ok: true, via: "smtp" as const };
    }

    throw new Error("Unknown notification channel");
  });

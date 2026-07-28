import { Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { useReveal } from "@/hooks/use-reveal";
import { subscribeEmail } from "@/lib/home.functions";

type Status = "idle" | "loading" | "success" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 订阅区：邮箱校验 + 提交三态，不刷新页面。 */
export function SubscribeSection() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const inputId = useId();
  const revealRef = useReveal<HTMLElement>();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = email.trim();

    if (!EMAIL_RE.test(value)) {
      setStatus("error");
      setMessage("请输入有效的邮箱地址");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const result = await subscribeEmail({ data: { email: value } });
      setStatus("success");
      setMessage(
        result.status === "duplicate"
          ? "这个邮箱已经订阅过了，感谢支持！"
          : "订阅成功，等我的更新。",
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("订阅失败了，稍后再试一次？");
    }
  };

  const invalid = status === "error";

  return (
    <section
      ref={revealRef}
      aria-labelledby="subscribe-title"
      className="mx-auto max-w-6xl px-6 py-14"
    >
      <div className="rounded-3xl bg-primary px-6 py-10 sm:px-12 sm:py-12">
        <p className="font-latin text-xs font-medium tracking-[0.2em] text-primary-foreground uppercase">
          Stay in touch
        </p>
        <h2
          id="subscribe-title"
          className="mt-3 text-2xl font-black tracking-tight text-primary-foreground sm:text-3xl"
        >
          订阅更新，不再错过一束光
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-primary-foreground/75">
          新的剪藏、自建服务踩坑记录与 AI Agent 笔记，更新时给你发一封信。不发广告，随时可退订。
        </p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-3 sm:flex-row" noValidate>
          <label htmlFor={inputId} className="sr-only">
            你的邮箱地址
          </label>
          <input
            id={inputId}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="你的邮箱地址"
            value={email}
            aria-invalid={invalid}
            aria-describedby={message ? `${inputId}-msg` : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            className="h-12 w-full rounded-xl bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none sm:w-[360px]"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent-ink)] px-6 text-sm font-bold text-primary transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none disabled:opacity-70"
          >
            {status === "loading" && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {status === "loading" ? "提交中" : "订阅"}
          </button>
        </form>

        <p
          id={`${inputId}-msg`}
          role="status"
          aria-live="polite"
          className={`mt-3 min-h-5 text-sm ${
            invalid ? "font-medium text-primary-foreground" : "text-primary-foreground/80"
          }`}
        >
          {message}
        </p>
      </div>
    </section>
  );
}

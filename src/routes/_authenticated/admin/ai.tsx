import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminStore, type AIConfig } from "@/lib/admin-store";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  component: AIPage,
});

const PROVIDER_PRESETS: Record<
  AIConfig["provider"],
  { endpoint: string; model: string }
> = {
  deepseek: {
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  custom: { endpoint: "", model: "" },
};

function AIPage() {
  const store = useAdminStore();
  const [ai, setAi] = useState<AIConfig>(store.ai);

  useEffect(() => setAi(store.ai), [store.ai]);

  function save() {
    store.updateAI(ai);
    toast.success("AI 配置已保存");
  }

  function resetDefault() {
    const preset = PROVIDER_PRESETS.deepseek;
    setAi({ provider: "deepseek", apiKey: "", ...preset });
  }

  function onProvider(p: AIConfig["provider"]) {
    const preset = PROVIDER_PRESETS[p];
    setAi((prev) => ({
      ...prev,
      provider: p,
      endpoint: preset.endpoint || prev.endpoint,
      model: preset.model || prev.model,
    }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">AI 配置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          用于文章 SEO 优化、标题/摘要润色等。默认 DeepSeek，可切换 OpenAI
          或自定义 OpenAI 兼容端点。
        </p>
      </header>

      <section className="space-y-5 rounded-xl border border-border/70 bg-card/40 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold">模型与凭据</h2>
        </div>

        <div>
          <Label>提供商</Label>
          <Select
            value={ai.provider}
            onValueChange={(v) => onProvider(v as AIConfig["provider"])}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek">DeepSeek（默认）</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="custom">自定义（OpenAI 兼容）</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="endpoint">Endpoint</Label>
          <Input
            id="endpoint"
            value={ai.endpoint}
            onChange={(e) => setAi({ ...ai, endpoint: e.target.value })}
            placeholder="https://api.deepseek.com/v1/chat/completions"
            className="mt-1.5 font-mono text-sm"
            maxLength={500}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="model">模型</Label>
            <Input
              id="model"
              value={ai.model}
              onChange={(e) => setAi({ ...ai, model: e.target.value })}
              placeholder="deepseek-chat"
              className="mt-1.5 font-mono text-sm"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={ai.apiKey}
              onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
              placeholder="sk-..."
              className="mt-1.5"
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={resetDefault}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> 重置为默认
          </Button>
          <Button size="sm" onClick={save}>
            <Save className="mr-1.5 h-4 w-4" /> 保存
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          凭据经服务端加密后存储。所有 AI
          请求由服务端代理转发，不会在浏览器中直接调用第三方 API。
        </p>
      </section>
    </div>
  );
}

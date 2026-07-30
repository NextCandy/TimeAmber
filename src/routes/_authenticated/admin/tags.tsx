import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";
import { addTagRow, deleteTagRow } from "@/lib/state.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/tags")({
  component: TagsPage,
});

function TagsPage() {
  const { tags, posts, addTag, removeTag, suppressNextPersist } = useAdminStore();

  // 同分类页：标签改动单独写库，不再挂在会重写全部文章的全量 persist 上。
  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      toast.success(ok);
    } catch (error) {
      console.error("[TimeAmber] 标签写入失败", error);
      toast.error("保存失败，请重试");
    }
  }
  const [newName, setNewName] = useState("");

  const counts = new Map<string, number>();
  for (const p of posts) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const name = newName.trim();
    suppressNextPersist();
    addTag(name);
    setNewName("");
    void run(() => addTagRow({ data: { name } }), "已添加");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">标签</h1>
        <p className="mt-1 text-sm text-muted-foreground">共 {tags.length} 个标签</p>
      </header>

      <form onSubmit={add} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新标签名称"
          maxLength={40}
        />
        <Button type="submit">
          <Plus className="mr-1.5 h-4 w-4" />
          添加
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {tags.map((t) => {
          const used = counts.get(t.name) ?? 0;
          return (
            <span
              key={t.name}
              className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs"
            >
              #{t.name}
              <span className="text-muted-foreground">·{used}</span>
              <button
                type="button"
                onClick={() => {
                  suppressNextPersist();
                  removeTag(t.name);
                  void run(() => deleteTagRow({ data: { name: t.name } }), "已删除");
                }}
                className="ml-0.5 inline-flex rounded-full bg-destructive p-0.5 text-destructive-foreground transition-colors hover:bg-destructive/90"
                aria-label={`删除 ${t.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {tags.length === 0 && <p className="text-sm text-muted-foreground">还没有标签</p>}
      </div>
    </div>
  );
}

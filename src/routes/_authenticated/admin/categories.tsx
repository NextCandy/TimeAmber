import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { useAdminStore } from "@/lib/admin-store";
import { addCategoryRow, deleteCategoryRow, renameCategoryRow } from "@/lib/state.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const { categories, posts, addCategory, renameCategory, removeCategory, suppressNextPersist } =
    useAdminStore();

  // 分类改动只碰 categories/posts 两张表；走全量 persist 会连带重写上千篇文章，
  // 慢且常超时，改动经常写不进库。
  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      toast.success(ok);
    } catch (error) {
      console.error("[TimeAmber] 分类写入失败", error);
      toast.error("保存失败，请重试");
    }
  }
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const counts = new Map<string, number>();
  for (const p of posts) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const name = newName.trim();
    suppressNextPersist();
    addCategory(name);
    setNewName("");
    void run(() => addCategoryRow({ data: { name } }), "已添加");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">分类</h1>
        <p className="mt-1 text-sm text-muted-foreground">共 {categories.length} 个分类</p>
      </header>

      <form onSubmit={add} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新分类名称"
          maxLength={40}
        />
        <Button type="submit">
          <Plus className="mr-1.5 h-4 w-4" />
          添加
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        <ul className="divide-y divide-border/60">
          {categories.map((c) => {
            const used = counts.get(c.name) ?? 0;
            const isEditing = editing === c.name;
            return (
              <li key={c.name} className="flex items-center justify-between gap-3 px-5 py-3">
                {isEditing ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="max-w-xs"
                      autoFocus
                      maxLength={40}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const to = editValue.trim();
                          suppressNextPersist();
                          renameCategory(c.name, to);
                          setEditing(null);
                          void run(
                            () => renameCategoryRow({ data: { from: c.name, to } }),
                            "已重命名",
                          );
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditing(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{used} 篇文章</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(c.name);
                          setEditValue(c.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={used > 0}
                        title={used > 0 ? "请先迁移这些文章" : ""}
                        onClick={() => {
                          suppressNextPersist();
                          removeCategory(c.name);
                          void run(() => deleteCategoryRow({ data: { name: c.name } }), "已删除");
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

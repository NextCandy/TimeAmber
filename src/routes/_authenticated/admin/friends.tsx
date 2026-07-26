import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { useAdminStore, type Friend } from "@/lib/admin-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/friends")({
  component: FriendsPage,
});

function FriendsPage() {
  const { friends, upsertFriend, removeFriend } = useAdminStore();
  const [editing, setEditing] = useState<{ friend: Friend; original?: string } | null>(
    null,
  );

  function openNew() {
    setEditing({ friend: { name: "", url: "https://", desc: "", group: "" } });
  }
  function openEdit(f: Friend) {
    setEditing({ friend: { ...f }, original: f.name });
  }

  function save() {
    if (!editing) return;
    const f = editing.friend;
    if (!f.name.trim() || !f.url.trim()) {
      toast.error("名称和链接不能为空");
      return;
    }
    try {
      new URL(f.url);
    } catch {
      toast.error("链接格式不正确");
      return;
    }
    upsertFriend(f, editing.original);
    toast.success("已保存");
    setEditing(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">友链</h1>
          <p className="mt-1 text-sm text-muted-foreground">共 {friends.length} 个友链</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          新增友链
        </Button>
      </header>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
        {friends.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">还没有友链</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {friends.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {f.name}
                    {f.group && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-normal text-primary">
                        {f.group}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{f.url}</span>
                  </p>
                  {f.desc && (
                    <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(f)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      removeFriend(f.name);
                      toast.success("已删除");
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.original ? "编辑友链" : "新增友链"}</DialogTitle>
            <DialogDescription>填写名称、链接和简介。</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="fname">名称</Label>
                <Input
                  id="fname"
                  value={editing.friend.name}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      friend: { ...editing.friend, name: e.target.value },
                    })
                  }
                  className="mt-1.5"
                  maxLength={80}
                />
              </div>
              <div>
                <Label htmlFor="furl">链接</Label>
                <Input
                  id="furl"
                  type="url"
                  value={editing.friend.url}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      friend: { ...editing.friend, url: e.target.value },
                    })
                  }
                  className="mt-1.5"
                  maxLength={500}
                />
              </div>
              <div>
                <Label htmlFor="fdesc">简介</Label>
                <Input
                  id="fdesc"
                  value={editing.friend.desc}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      friend: { ...editing.friend, desc: e.target.value },
                    })
                  }
                  className="mt-1.5"
                  maxLength={200}
                />
              </div>
              <div>
                <Label htmlFor="fgroup">分组（可选）</Label>
                <Input
                  id="fgroup"
                  value={editing.friend.group ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      friend: { ...editing.friend, group: e.target.value },
                    })
                  }
                  placeholder="留空则归入「默认」组"
                  className="mt-1.5"
                  maxLength={40}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={save}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

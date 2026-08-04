import { Search } from "lucide-react";
import { useState } from "react";

import { SearchDialog } from "@/components/layout/SearchDialog";

export function PublicSearch({ placeholder }: { placeholder: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="public-search press-feedback group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm focus-visible:outline-none"
        aria-label="打开站内搜索"
      >
        <Search className="h-4 w-4 shrink-0 text-accent-amber" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>
        <kbd className="hidden shrink-0 rounded-md border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          ⌘ K
        </kbd>
      </button>
      <SearchDialog open={open} onOpenChange={setOpen} placeholder={placeholder} />
    </>
  );
}

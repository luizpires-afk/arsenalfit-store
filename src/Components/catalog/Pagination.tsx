import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPaginationRange } from "@/lib/catalog";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (value: number) => void;
  className?: string;
};

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  pageSizeOptions = [12, 24, 36],
  onPageSizeChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPaginationRange(page, totalPages, 1);
  const canGoBack = page > 1;
  const canGoForward = page < totalPages;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoBack}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-300 transition disabled:opacity-40"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>

        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="inline-flex h-10 items-center justify-center rounded-full px-3 text-zinc-500"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={page === item ? "page" : undefined}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full border text-[11px] font-black uppercase tracking-[0.2em] transition",
                page === item
                  ? "border-[hsl(var(--accent-green))]/60 bg-[hsl(var(--accent-green))]/15 text-[hsl(var(--accent-green))]"
                  : "border-white/10 bg-black/40 text-zinc-400 hover:text-white hover:border-white/25"
              )}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoForward}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-300 transition disabled:opacity-40"
        >
          Próximo
          <ChevronRight size={14} />
        </button>
      </div>

      {onPageSizeChange && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
            Itens por página
          </span>
          <div className="flex items-center gap-2">
            {pageSizeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onPageSizeChange(option)}
                className={cn(
                  "h-9 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.3em] transition",
                  pageSize === option
                    ? "border-[hsl(var(--accent-green))]/60 bg-[hsl(var(--accent-green))]/15 text-[hsl(var(--accent-green))]"
                    : "border-white/10 bg-black/40 text-zinc-400 hover:text-white hover:border-white/25"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

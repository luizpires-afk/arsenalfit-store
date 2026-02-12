import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type CatalogSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  iconClassName?: string;
};

export function CatalogSearchBar({
  value,
  onChange,
  placeholder = "Buscar produtos...",
  className,
  inputClassName,
  iconClassName,
}: CatalogSearchBarProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500",
          iconClassName
        )}
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "w-full h-12 rounded-full border border-white/10 bg-black/40 pl-11 pr-4 text-[13px] text-white placeholder:text-zinc-500 focus:border-[hsl(var(--accent-green))]/50 focus:ring-2 focus:ring-[hsl(var(--accent-green))]/10 outline-none transition-all",
          inputClassName
        )}
      />
    </div>
  );
}

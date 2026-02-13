import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/Components/ui/select";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SubFiltersDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  active?: boolean;
};

// Workaround tipagem Radix/Shadcn
const ST = SelectTrigger as any;
const SC = SelectContent as any;
const SI = SelectItem as any;

export function SubFiltersDropdown({
  value,
  onChange,
  options,
  className,
  triggerClassName,
  contentClassName,
  active,
}: SubFiltersDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <Select value={value} onValueChange={onChange} open={open} onOpenChange={setOpen}>
      <ST
        onPointerDown={(event: any) => {
          if (!open) return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }}
        className={cn(
          "w-full h-12 rounded-full border border-white/10 bg-black/40 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-300 hover:border-white/25 transition-all",
          active &&
            "border-[#ff7a00]/50 ring-2 ring-[#ff7a00]/10 text-[#ff7a00]",
          className,
          triggerClassName
        )}
      >
        <SelectValue placeholder="Filtrar por" />
      </ST>
      <SC
        className={cn(
          "bg-zinc-950 border-white/10 rounded-2xl overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.4)]",
          contentClassName
        )}
      >
        {options.map((option) => (
          <SI
            key={option.value}
            value={option.value}
            className="py-3 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-300 focus:bg-[hsl(var(--accent-orange))]/20 focus:text-[hsl(var(--accent-orange))]"
          >
            {option.label}
          </SI>
        ))}
      </SC>
    </Select>
  );
}

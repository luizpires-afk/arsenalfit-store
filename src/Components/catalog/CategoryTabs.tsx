import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type CategoryTab = {
  value: string;
  label: string;
  href?: string;
};

type CategoryTabsProps = {
  value?: string | null;
  tabs: CategoryTab[];
  onChange?: (value: string) => void;
  className?: string;
};

export function CategoryTabs({
  value,
  tabs,
  onChange,
  className,
}: CategoryTabsProps) {
  return (
    <div
      className={cn(
        "flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar rounded-full border border-white/10 bg-black/35 p-2",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = value === tab.value;
        const baseClasses =
          "inline-flex items-center justify-center shrink-0 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-200";
        const activeClasses =
          "border border-[hsl(var(--accent-orange))]/45 bg-[hsl(var(--accent-orange))]/12 text-[hsl(var(--accent-orange))] shadow-[0_0_10px_rgba(255,122,0,0.18)]";
        const inactiveClasses =
          "border border-white/10 bg-black/30 text-zinc-400 hover:text-white hover:border-white/25";

        if (tab.href) {
          return (
            <Link
              key={tab.value}
              to={tab.href}
              className={cn(baseClasses, isActive ? activeClasses : inactiveClasses)}
            >
              {tab.label}
            </Link>
          );
        }

        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange?.(tab.value)}
            className={cn(baseClasses, isActive ? activeClasses : inactiveClasses)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

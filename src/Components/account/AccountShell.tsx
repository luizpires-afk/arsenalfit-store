import { type ElementType, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/Components/ui/button";
import { TabsList, TabsTrigger } from "@/Components/ui/tabs";
import { cn } from "@/lib/utils";

type BreadcrumbItem = {
  label: string;
  active?: boolean;
  icon?: ElementType;
};

type TabItem = {
  value: string;
  label: string;
  icon: ElementType;
};

type AccountShellProps = {
  onBack: () => void;
  heroImage: string;
  breadcrumbItems: BreadcrumbItem[];
  title: string;
  subtitle: string;
  tabs: TabItem[];
  children: ReactNode;
};

type GlassCardProps = {
  className?: string;
  children: ReactNode;
};

export const GlassCard = ({ className, children }: GlassCardProps) => (
  <div
    className={cn(
      "rounded-[24px] border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] shadow-[var(--shadow-soft)] backdrop-blur-[var(--blur-glass)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_22px_48px_rgba(0,0,0,0.35)] focus-within:ring-1 focus-within:ring-[hsl(var(--accent-orange))]/40",
      className
    )}
  >
    {children}
  </div>
);

export const BreadcrumbChips = ({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar text-[10px] font-black uppercase tracking-[0.35em] text-zinc-400 sm:flex-wrap sm:overflow-visible",
      className
    )}
  >
    {items.map((item) => (
      <span
        key={item.label}
        className={cn(
          "inline-flex items-center gap-2 rounded-[var(--chip-radius)] border border-[rgb(var(--chip-border))] bg-[rgb(var(--chip-bg))] px-3 py-1 text-zinc-300 transition-all duration-200 hover:border-white/25 hover:text-white",
          item.active &&
            "border-[hsl(var(--accent-orange))]/45 bg-[hsl(var(--accent-orange))]/15 text-[hsl(var(--accent-orange))] shadow-[0_0_12px_rgba(249,115,22,0.22)] hover:border-[hsl(var(--accent-orange))]/70"
        )}
      >
        {item.active && item.icon ? (
          <item.icon className="h-3.5 w-3.5 text-current" />
        ) : null}
        {item.label}
      </span>
    ))}
  </div>
);

export const SegmentedTabs = ({
  tabs,
  className,
}: {
  tabs: TabItem[];
  className?: string;
}) => (
  <TabsList
    className={cn(
      "h-auto w-full justify-start gap-2 overflow-x-auto no-scrollbar rounded-full border border-[rgb(var(--chip-border))] bg-[rgb(var(--chip-bg))] p-2 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
      className
    )}
  >
    {tabs.map((tab) => (
      <TabsTrigger
        key={tab.value}
        value={tab.value}
        className="group relative shrink-0 gap-2 rounded-full border border-transparent bg-transparent px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 transition-all duration-200 hover:border-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-orange))] focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=active]:border-[hsl(var(--accent-orange))]/60 data-[state=active]:bg-[hsl(var(--accent-orange))]/15 data-[state=active]:text-[hsl(var(--accent-orange))] after:absolute after:inset-x-4 after:-bottom-[6px] after:h-[2px] after:rounded-full after:bg-transparent after:transition after:duration-200 data-[state=active]:after:bg-[hsl(var(--accent-orange))]"
      >
        <tab.icon className="h-3.5 w-3.5" />
        {tab.label}
      </TabsTrigger>
    ))}
  </TabsList>
);

export function AccountShell({
  onBack,
  heroImage,
  breadcrumbItems,
  title,
  subtitle,
  tabs,
  children,
}: AccountShellProps) {
  const reduceMotion = useReducedMotion();
  const heroMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32 },
      };

  return (
    <div>
      <section className="relative min-h-[300px] sm:min-h-[360px] overflow-hidden">
        <div className="absolute inset-0 bg-zinc-950" />
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${heroImage}")` }}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--bg))] via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-transparent to-transparent" />

        <div className="relative container h-full px-4 pt-6 pb-12 space-y-6">
          <Button
            variant="ghost"
            onClick={onBack}
            className="group inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-300 hover:border-white/30 hover:bg-black/55 hover:text-white transition-all focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-orange))] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors group-hover:bg-[hsl(var(--accent-orange))] group-hover:text-black">
              <ArrowLeft size={14} />
            </span>
            Voltar
          </Button>

          <div className="relative max-w-5xl w-full mx-auto">
            <motion.div {...heroMotion}>
              <GlassCard className="relative overflow-hidden p-6 sm:p-7 bg-gradient-to-br from-black/70 via-black/55 to-black/35">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_60%)]" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/25" />
                <div className="relative z-10 space-y-6">
                  <BreadcrumbChips items={breadcrumbItems} />
                  <div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase italic tracking-tight text-[hsl(var(--text))]">
                      {title}
                    </h1>
                    <p className="mt-3 text-sm text-zinc-300 max-w-2xl">
                      {subtitle}
                    </p>
                  </div>
                  <SegmentedTabs tabs={tabs} />
                </div>
              </GlassCard>
            </motion.div>
          </div>
        </div>
      </section>

      <main id="main-content" className="container px-4 pb-14 pt-8">
        {children}
      </main>
    </div>
  );
}

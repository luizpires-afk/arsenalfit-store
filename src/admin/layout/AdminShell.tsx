import { Link, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: "Operating OS",
    items: [{ to: "/admin/ops", label: "Operations" }],
  },
  {
    title: "Dashboard",
    items: [{ to: "/admin", label: "Overview" }],
  },
  {
    title: "SEO",
    items: [
      { to: "/admin/seo-pages", label: "SEO Pages" },
      { to: "/admin/seo-clusters", label: "SEO Clusters" },
      { to: "/admin/seo-health", label: "SEO Health" },
    ],
  },
  {
    title: "Products",
    items: [
      { to: "/admin/products", label: "Products" },
      { to: "/admin/products-queue", label: "Products Queue" },
      { to: "/admin/import-products", label: "Import Products" },
    ],
  },
  {
    title: "Discovery",
    items: [
      { to: "/admin/discovery", label: "Discovery Queue" },
      { to: "/admin/trend-products", label: "Trend Products" },
      { to: "/admin/viral-products", label: "Viral Products" },
    ],
  },
  {
    title: "Pricing",
    items: [
      { to: "/admin/price-sync", label: "Price Sync" },
      { to: "/admin/price-adjustments", label: "Price Adjustments" },
    ],
  },
  {
    title: "AI",
    items: [{ to: "/admin/ai-system", label: "AI System" }],
  },
  {
    title: "System",
    items: [
      { to: "/admin/operational-reliability", label: "Operational Reliability" },
      { to: "/admin/system-explorer", label: "System Explorer" },
      { to: "/admin/pipeline-health", label: "Pipeline Health" },
    ],
  },
];

type AdminShellProps = {
  title?: string;
  description?: string;
  children?: React.ReactNode;
};

export default function AdminShell({ title, description, children }: AdminShellProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-secondary/20">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-6 md:flex-row md:gap-6 md:px-6">
        <aside className="hidden w-64 shrink-0 self-start rounded-xl border bg-card p-4 md:sticky md:top-20 md:block md:max-h-[calc(100vh-6rem)] md:overflow-y-auto">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Admin</p>
          <div className="space-y-5">
            {sections.map((section) => (
              <div key={section.title}>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{section.title}</p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive =
                      location.pathname === item.to ||
                      (item.to !== "/admin" && location.pathname.startsWith(`${item.to}/`));
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm transition-colors",
                          isActive ? "bg-foreground text-background" : "hover:bg-muted",
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="rounded-xl border bg-card p-4 md:hidden">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sections.flatMap((section) => section.items).map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "rounded-md border px-3 py-2 text-center text-xs",
                      isActive ? "bg-foreground text-background border-foreground" : "hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {title ? (
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            </div>
          ) : null}

          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

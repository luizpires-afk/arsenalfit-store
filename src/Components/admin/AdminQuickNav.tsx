import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/seo-pages", label: "SEO Pages" },
  { to: "/admin/seo-clusters", label: "SEO Clusters" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/products-queue", label: "Products Queue" },
  { to: "/admin/import-products", label: "Import Products" },
  { to: "/admin/discovery", label: "Discovery Queue" },
  { to: "/admin/trend-products", label: "Trend Products" },
  { to: "/admin/viral-products", label: "Viral Products" },
  { to: "/admin/price-sync", label: "Price Sync" },
  { to: "/admin/price-adjustments", label: "Price Adjustments" },
  { to: "/admin/ai-system", label: "AI System" },
  { to: "/admin/system-explorer", label: "System Explorer" },
  { to: "/admin/pipeline-health", label: "Pipeline Health" },
];

export function AdminQuickNav() {
  const location = useLocation();

  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => {
        const isActive = location.pathname === link.to;
        return (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-foreground text-background border-foreground"
                : "bg-background hover:bg-muted",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

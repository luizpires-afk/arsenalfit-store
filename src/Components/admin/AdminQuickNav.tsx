import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/admin/ai-system", label: "AI System" },
  { to: "/admin/import-products", label: "Import Products" },
  { to: "/admin/products-queue", label: "Products Queue" },
  { to: "/admin/trend-products", label: "Trend Products" },
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

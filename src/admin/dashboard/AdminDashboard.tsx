import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";

const groups = [
  {
    title: "SEO",
    description: "Programmatic SEO management and indexing visibility.",
    links: [
      { to: "/admin/seo-pages", label: "SEO Pages" },
      { to: "/admin/seo-clusters", label: "SEO Clusters" },
      { to: "/admin/seo-health", label: "SEO Health" },
    ],
  },
  {
    title: "Products",
    description: "Catalog operations and queue workflows.",
    links: [
      { to: "/admin/products", label: "Products" },
      { to: "/admin/products-queue", label: "Products Queue" },
      { to: "/admin/import-products", label: "Import Products" },
    ],
  },
  {
    title: "Discovery",
    description: "Trend and viral pipeline approval.",
    links: [
      { to: "/admin/discovery", label: "Discovery Queue" },
      { to: "/admin/trend-products", label: "Trend Products" },
      { to: "/admin/viral-products", label: "Viral Products" },
    ],
  },
  {
    title: "Pricing",
    description: "Price sync reports and manual adjustments.",
    links: [
      { to: "/admin/price-sync", label: "Price Sync" },
      { to: "/admin/price-adjustments", label: "Price Adjustments" },
    ],
  },
  {
    title: "AI",
    description: "AI orchestration and model metrics.",
    links: [{ to: "/admin/ai-system", label: "AI System" }],
  },
  {
    title: "System",
    description: "Operational observability and pipeline status.",
    links: [
      { to: "/admin/system-explorer", label: "System Explorer" },
      { to: "/admin/pipeline-health", label: "Pipeline Health" },
    ],
  },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Single entry point for SEO, products, discovery, pricing and system operations.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {group.links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="block rounded-md border p-3 text-sm hover:bg-muted transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

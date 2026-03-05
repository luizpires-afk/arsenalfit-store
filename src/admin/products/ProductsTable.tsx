import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/Components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";

const PAGE_SIZE = 50;

const fmtDate = (value: string | null | undefined) => {
	if (!value) return "-";
	try {
		return new Date(value).toLocaleString();
	} catch {
		return String(value);
	}
};

export default function ProductsTable() {
	const [page, setPage] = useState(0);

	const { data, isLoading, isFetching, refetch } = useQuery({
		queryKey: ["admin-products-table", page],
		queryFn: async () => {
			const from = page * PAGE_SIZE;
			const to = from + PAGE_SIZE - 1;
			const { data: rows, error, count } = await supabase
				.from("products")
				.select("id,name,status,price,is_active,marketplace,updated_at", { count: "exact" })
				.order("updated_at", { ascending: false })
				.range(from, to);

			if (error) throw error;
			return {
				rows: rows || [],
				total: count || 0,
			};
		},
		refetchInterval: 30000,
	});

	const total = data?.total || 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const hasPrev = page > 0;
	const hasNext = page + 1 < totalPages;

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Products</h1>
				<p className="text-sm text-muted-foreground">
					Paginated product listing with access to the legacy operations console.
				</p>
			</div>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between gap-3">
					<CardTitle className="text-base">products</CardTitle>
					<div className="flex gap-2">
						<Button asChild variant="outline" size="sm">
							<Link to="/admin/products-legacy">Open Legacy Product Console</Link>
						</Button>
						<Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
							{isFetching ? "Refreshing..." : "Refresh"}
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading ? <p>Loading products...</p> : null}

					{!isLoading ? (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b text-left">
										<th className="py-2 pr-3">name</th>
										<th className="py-2 pr-3">status</th>
										<th className="py-2 pr-3">is_active</th>
										<th className="py-2 pr-3">marketplace</th>
										<th className="py-2 pr-3">price</th>
										<th className="py-2 pr-3">updated_at</th>
									</tr>
								</thead>
								<tbody>
									{(data?.rows || []).map((row) => (
										<tr key={row.id} className="border-b align-top">
											<td className="py-2 pr-3">{row.name}</td>
											<td className="py-2 pr-3">{row.status || "-"}</td>
											<td className="py-2 pr-3">{row.is_active ? "true" : "false"}</td>
											<td className="py-2 pr-3">{row.marketplace || "-"}</td>
											<td className="py-2 pr-3">{row.price ?? "-"}</td>
											<td className="py-2 pr-3">{fmtDate(row.updated_at)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : null}

					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-sm text-muted-foreground">
							Page {page + 1} of {totalPages} | {total} rows
						</p>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={!hasPrev || isFetching}>
								Previous
							</Button>
							<Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext || isFetching}>
								Next
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/ui/card";
import { Textarea } from "@/Components/ui/textarea";
import { Button } from "@/Components/ui/button";
import { Label } from "@/Components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const parseLines = (input: string) =>
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const isValidUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const extractMlItemId = (value: string) => {
  const match = String(value || "").toUpperCase().match(/MLB\d{6,14}/i);
  return match ? match[0].toUpperCase() : null;
};

type ImportSummary = {
  imported: number;
  invalid: number;
  pipelineTriggered: boolean;
};

export default function AdminProductImport() {
  const [productUrlsInput, setProductUrlsInput] = useState("");
  const [affiliateUrlsInput, setAffiliateUrlsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const productLines = useMemo(() => parseLines(productUrlsInput), [productUrlsInput]);
  const affiliateLines = useMemo(() => parseLines(affiliateUrlsInput), [affiliateUrlsInput]);

  const countMismatch = productLines.length !== affiliateLines.length;

  const handleSubmit = async () => {
    const productUrls = parseLines(productUrlsInput);
    const affiliateUrls = parseLines(affiliateUrlsInput);

    if (!productUrls.length || !affiliateUrls.length) {
      toast.error("Preencha os dois campos com URLs.");
      return;
    }

    if (productUrls.length !== affiliateUrls.length) {
      toast.error("Number of product links and affiliate links must match.");
      return;
    }

    const validPairs: Array<{ productUrl: string; affiliateUrl: string; mlItemId: string }> = [];
    let invalidLinks = 0;

    for (let i = 0; i < productUrls.length; i += 1) {
      const productUrl = productUrls[i];
      const affiliateUrl = affiliateUrls[i];
      const mlItemId = extractMlItemId(productUrl);

      if (!isValidUrl(productUrl) || !isValidUrl(affiliateUrl) || !mlItemId) {
        invalidLinks += 1;
        continue;
      }

      validPairs.push({ productUrl, affiliateUrl, mlItemId });
    }

    if (!validPairs.length) {
      setSummary({ imported: 0, invalid: invalidLinks, pipelineTriggered: false });
      toast.error("Nenhum link valido encontrado para importacao.");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = validPairs.map((pair, idx) => ({
        name: `ML ${pair.mlItemId}`,
        slug: `ml-${pair.mlItemId.toLowerCase()}-${Date.now()}-${idx}`,
        marketplace: "mercadolivre",
        external_id: pair.mlItemId,
        ml_item_id: pair.mlItemId,
        source_url: pair.productUrl,
        canonical_offer_url: `https://www.mercadolivre.com.br/p/${pair.mlItemId}`,
        affiliate_link: pair.affiliateUrl,
        status: "pending_validation",
        affiliate_validation_status: "PENDING",
        affiliate_verified: false,
        is_active: false,
        price: 0,
        stock_quantity: 0,
        updated_at: now,
      }));

      const { data: inserted, error } = await supabase
        .from("products")
        .upsert(payload, { onConflict: "ml_item_id" })
        .select("id, ml_item_id, source_url");
      if (error) throw error;

      const catalogRows = (inserted || []).map((row) => {
        const pair = validPairs.find((x) => x.mlItemId === row.ml_item_id);
        return {
          product_id: row.id,
          ml_item_id: row.ml_item_id,
          source_url: row.source_url,
          affiliate_url: pair?.affiliateUrl || null,
          raw_payload: {
            imported_from: "admin_import_products",
            affiliate_url: pair?.affiliateUrl || null,
          },
        };
      });

      if (catalogRows.length > 0) {
        const { error: catalogError } = await supabase
          .from("product_catalog_data")
          .upsert(catalogRows, { onConflict: "ml_item_id" });
        if (catalogError) throw catalogError;
      }

      const { error: triggerError } = await supabase.rpc("trigger_catalog_ingest_auto");
      const pipelineTriggered = !triggerError;

      setSummary({
        imported: inserted?.length || 0,
        invalid: invalidLinks,
        pipelineTriggered,
      });

      toast.success(`Products Imported: ${inserted?.length || 0}`);
      setProductUrlsInput("");
      setAffiliateUrlsInput("");
    } catch (error: any) {
      toast.error(error?.message || "Falha ao importar produtos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Product Import</CardTitle>
          <CardDescription>
            Cole URLs validadas e URLs de afiliado com pareamento linha a linha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="validated-products">Mercado Livre Product Links</Label>
              <Textarea
                id="validated-products"
                value={productUrlsInput}
                onChange={(e) => setProductUrlsInput(e.target.value)}
                placeholder={"https://produto.mercadolivre.com.br/MLB123\nhttps://produto.mercadolivre.com.br/MLB456\nhttps://produto.mercadolivre.com.br/MLB789"}
                className="min-h-[260px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="affiliate-products">Affiliate URLs</Label>
              <Textarea
                id="affiliate-products"
                value={affiliateUrlsInput}
                onChange={(e) => setAffiliateUrlsInput(e.target.value)}
                placeholder={"https://afiliado.mercadolivre.com.br/abc\nhttps://afiliado.mercadolivre.com.br/def\nhttps://afiliado.mercadolivre.com.br/ghi"}
                className="min-h-[260px]"
              />
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>Products: {productLines.length}</p>
            <p>Affiliates: {affiliateLines.length}</p>
            {countMismatch ? <p className="text-destructive">Contagem de linhas divergente.</p> : null}
          </div>

          <Button onClick={handleSubmit} disabled={saving || countMismatch}>
            {saving ? "Importing..." : "IMPORT"}
          </Button>

          {summary ? (
            <div className="rounded-md border p-4 text-sm space-y-1">
              <p>Products Imported: {summary.imported}</p>
              <p>Invalid Links: {summary.invalid}</p>
              <p>Pipeline Triggered: {summary.pipelineTriggered ? "YES" : "NO"}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

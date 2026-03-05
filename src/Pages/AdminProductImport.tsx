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

export default function AdminProductImport() {
  const [productUrlsInput, setProductUrlsInput] = useState("");
  const [affiliateUrlsInput, setAffiliateUrlsInput] = useState("");
  const [saving, setSaving] = useState(false);

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
      toast.error("As listas devem ter o mesmo numero de linhas.");
      return;
    }

    for (let i = 0; i < productUrls.length; i += 1) {
      if (!isValidUrl(productUrls[i])) {
        toast.error(`URL de produto invalida na linha ${i + 1}.`);
        return;
      }
      if (!isValidUrl(affiliateUrls[i])) {
        toast.error(`URL de afiliado invalida na linha ${i + 1}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = productUrls.map((productUrl, idx) => ({
        product_url: productUrl,
        affiliate_url: affiliateUrls[idx],
        status: "pending",
      }));

      const { error } = await supabase.from("product_import_queue").insert(payload);
      if (error) throw error;

      toast.success(`Fila criada com ${payload.length} itens.`);
      setProductUrlsInput("");
      setAffiliateUrlsInput("");
    } catch (error: any) {
      toast.error(error?.message || "Falha ao inserir na fila de importacao.");
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
              <Label htmlFor="validated-products">Validated Product URLs</Label>
              <Textarea
                id="validated-products"
                value={productUrlsInput}
                onChange={(e) => setProductUrlsInput(e.target.value)}
                placeholder={"https://store/product1\nhttps://store/product2\nhttps://store/product3"}
                className="min-h-[260px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="affiliate-products">Affiliate URLs</Label>
              <Textarea
                id="affiliate-products"
                value={affiliateUrlsInput}
                onChange={(e) => setAffiliateUrlsInput(e.target.value)}
                placeholder={"https://affiliate/product1\nhttps://affiliate/product2\nhttps://affiliate/product3"}
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
            {saving ? "Enfileirando..." : "Create Import Queue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

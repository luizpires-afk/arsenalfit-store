import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import {
  getAllowRedirectWhileStandby,
  getOfferUnavailableMessage,
  resolveOfferUrl,
} from "@/lib/offer.js";

type ResolvePayload = {
  can_redirect?: boolean;
  url?: string | null;
  reason?: string | null;
};

const getFriendlyMessage = (reason: string | null) => {
  const normalized = String(reason ?? "").toLowerCase();
  if (normalized === "awaiting_affiliate_validation") {
    return "Este produto ainda aguarda validacao do link de afiliado.";
  }
  if (normalized === "blocked_by_policy") {
    return "Este anuncio foi bloqueado pela politica da API.";
  }
  if (normalized === "invalid_target_domain") {
    return "A URL de destino foi invalidada por seguranca.";
  }
  return "Nao foi possivel abrir esta oferta agora.";
};

export default function OutProduct() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const clickSource = useMemo(
    () => String(searchParams.get("src") || "offer_click"),
    [searchParams],
  );

  useEffect(() => {
    let cancelled = false;

    const productSelectFields =
      "id, marketplace, status, is_active, data_health_status, affiliate_verified, affiliate_link, source_url, canonical_offer_url, ml_item_id, auto_disabled_reason, updated_at, last_sync, detected_at";

    const resolveLocalOffer = (productData: any, allowStandby: boolean) => {
      const localResolution = resolveOfferUrl(productData as any, {
        allowRedirectWhileStandby: allowStandby,
      });
      return {
        destination: localResolution.url ?? null,
        canRedirect: Boolean(localResolution.canRedirect && localResolution.url),
        reason: localResolution.reason ?? null,
      };
    };

    const resolveFromProductOrSibling = async (productId: string, allowStandby: boolean) => {
      let resolvedMarketplace: string | null = null;

      const { data: productData } = await supabase
        .from("products")
        .select(productSelectFields)
        .eq("id", productId)
        .maybeSingle();

      if (productData) {
        resolvedMarketplace = String(productData.marketplace || "");
        const local = resolveLocalOffer(productData, allowStandby);
        if (local.canRedirect && local.destination) {
          return {
            ...local,
            productMarketplace: resolvedMarketplace,
          };
        }

        const mlItemId = String(productData.ml_item_id || "").trim();
        if (mlItemId) {
          const { data: siblingCandidates } = await supabase
            .from("products")
            .select(productSelectFields)
            .eq("ml_item_id", mlItemId)
            .eq("is_active", true)
            .eq("status", "active")
            .eq("data_health_status", "HEALTHY")
            .or("auto_disabled_reason.is.null,auto_disabled_reason.neq.blocked")
            .order("updated_at", { ascending: false })
            .limit(5);

          if (Array.isArray(siblingCandidates) && siblingCandidates.length > 0) {
            for (const candidate of siblingCandidates) {
              const siblingLocal = resolveLocalOffer(candidate, allowStandby);
              if (siblingLocal.canRedirect && siblingLocal.destination) {
                return {
                  destination: siblingLocal.destination,
                  canRedirect: true,
                  reason: "sibling_ml_item_active_fallback",
                  productMarketplace: String(candidate.marketplace || resolvedMarketplace || ""),
                };
              }
            }
          }
        }

        return {
          ...local,
          productMarketplace: resolvedMarketplace,
        };
      }

      return {
        destination: null,
        canRedirect: false,
        reason: null,
        productMarketplace: resolvedMarketplace,
      };
    };

    const resolveAndRedirect = async () => {
      if (!id) {
        setMessage("Produto nao informado.");
        setLoading(false);
        return;
      }

      try {
        const allowStandby = getAllowRedirectWhileStandby(false);
        let destination: string | null = null;
        let canRedirect = false;
        let reason: string | null = null;
        let productMarketplace: string | null = null;

        try {
          const { data, error } = await supabase.rpc("resolve_product_offer_url", {
            p_product_id: id,
            p_allow_redirect_while_standby: allowStandby,
            p_click_source: clickSource,
            p_metadata: {
              runtime: "spa_route",
              pathname: window.location.pathname,
              search: window.location.search,
              user_agent: navigator.userAgent,
            },
          });
          if (error) throw error;

          const payload: ResolvePayload = Array.isArray(data) ? data[0] : data;
          destination = payload?.url ?? null;
          canRedirect = Boolean(payload?.can_redirect && destination);
          reason = payload?.reason ?? null;

          if (!canRedirect || !destination) {
            const localFallback = await resolveFromProductOrSibling(id, allowStandby);
            productMarketplace = localFallback.productMarketplace;
            if (localFallback.canRedirect && localFallback.destination) {
              destination = localFallback.destination;
              canRedirect = true;
              reason = localFallback.reason ?? reason;
            }
          }
        } catch {
          // Fallback local: se RPC nao estiver disponivel, resolve pelo helper local.
          const localFallback = await resolveFromProductOrSibling(id, allowStandby);
          productMarketplace = localFallback.productMarketplace;
          destination = localFallback.destination;
          canRedirect = Boolean(localFallback.canRedirect && destination);
          reason = localFallback.reason ?? null;
        }

        if (!canRedirect || !destination) {
          if (!cancelled) {
            const localMessage = reason
              ? getOfferUnavailableMessage({ reason }, productMarketplace || "mercadolivre")
              : getFriendlyMessage(reason);
            setMessage(localMessage);
            setLoading(false);
          }
          return;
        }

        void Promise.resolve(
          supabase.rpc("enqueue_price_check_refresh", {
            p_product_id: id,
            p_force: false,
            p_reason: clickSource,
          })
        ).catch(() => {});

        window.location.replace(destination);
      } catch (err: any) {
        if (!cancelled) {
          setMessage(err?.message || "Falha ao resolver a oferta.");
          setLoading(false);
        }
      }
    };

    resolveAndRedirect();
    return () => {
      cancelled = true;
    };
  }, [id, clickSource]);

  return (
    <main className="relative min-h-[72vh] md:min-h-[80vh] bg-[radial-gradient(circle_at_20%_0%,rgba(249,115,22,0.14),transparent_45%),radial-gradient(circle_at_100%_20%,rgba(163,230,53,0.08),transparent_42%),#09090b] text-zinc-100 flex items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-xl">
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/90 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="absolute -top-14 -right-10 h-32 w-32 rounded-full bg-orange-500/20 blur-2xl" />
          <div className="absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-lime-400/10 blur-2xl" />

          <div className="relative p-5 sm:p-8">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-black shadow-[0_8px_20px_rgba(249,115,22,0.35)]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verificacao segura
              </span>
              <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                ArsenalFit redirect
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Abrindo oferta
            </h1>

            {loading ? (
              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-5">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
                  <p className="text-sm sm:text-base font-medium">
                    Validando destino oficial da oferta...
                  </p>
                </div>
                <p className="mt-3 text-xs sm:text-sm text-zinc-400">
                  A verificacao protege seu clique e garante o link correto da vitrine.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-orange-400" />
                  <p className="text-sm sm:text-base text-zinc-200">
                    {message || "Oferta indisponivel."}
                  </p>
                </div>
                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-black uppercase tracking-wide text-zinc-900 transition hover:bg-lime-300"
                  >
                    Voltar para a loja
                  </Link>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] sm:text-xs text-zinc-500">
          Voce sera redirecionado para o site oficial quando a validacao for concluida.
        </p>
      </div>
    </main>
  );
}

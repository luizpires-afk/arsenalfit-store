import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getAllowRedirectWhileStandby } from "@/lib/offer.js";

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

    const resolveAndRedirect = async () => {
      if (!id) {
        setMessage("Produto nao informado.");
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("resolve_product_offer_url", {
          p_product_id: id,
          p_allow_redirect_while_standby: getAllowRedirectWhileStandby(false),
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
        const destination = payload?.url ?? null;
        const canRedirect = Boolean(payload?.can_redirect && destination);

        if (!canRedirect || !destination) {
          if (!cancelled) {
            setMessage(getFriendlyMessage(payload?.reason ?? null));
            setLoading(false);
          }
          return;
        }

        supabase
          .rpc("enqueue_price_check_refresh", {
            p_product_id: id,
            p_force: false,
            p_reason: clickSource,
          })
          .catch(() => {});

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
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-6">
      <div className="max-w-lg w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center space-y-4">
        <h1 className="text-xl font-bold">Abrindo oferta</h1>
        {loading ? (
          <p className="text-sm text-zinc-400">
            Estamos validando o destino seguro da oferta.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-300">{message || "Oferta indisponivel."}</p>
            <Link
              to="/"
              className="inline-flex items-center rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Voltar para a loja
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

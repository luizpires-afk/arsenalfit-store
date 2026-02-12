-- Tabela de auditoria das execucoes do runner
CREATE TABLE IF NOT EXISTS public.price_sync_runs (
  id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  stats_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_sync_runs_started_at
  ON public.price_sync_runs (started_at DESC);

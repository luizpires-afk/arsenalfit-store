-- Cria/ajusta tabela de monitoramento de precos (Mercado Livre e outros marketplaces)

CREATE TABLE IF NOT EXISTS public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace TEXT NOT NULL,
  item_id TEXT NOT NULL,
  preco NUMERIC,
  preco_anterior NUMERIC,
  etag TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  ultima_verificacao TIMESTAMPTZ,
  proxima_verificacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS marketplace TEXT,
  ADD COLUMN IF NOT EXISTS item_id TEXT,
  ADD COLUMN IF NOT EXISTS preco NUMERIC,
  ADD COLUMN IF NOT EXISTS preco_anterior NUMERIC,
  ADD COLUMN IF NOT EXISTS etag TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS ultima_verificacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proxima_verificacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE public.produtos
  ALTER COLUMN marketplace SET NOT NULL,
  ALTER COLUMN item_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN proxima_verificacao SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'produtos_status_check'
  ) THEN
    ALTER TABLE public.produtos
      ADD CONSTRAINT produtos_status_check
      CHECK (status IN ('active', 'out_of_stock', 'paused'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'produtos_marketplace_item_key'
  ) THEN
    ALTER TABLE public.produtos
      ADD CONSTRAINT produtos_marketplace_item_key UNIQUE (marketplace, item_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produtos_proxima_verificacao
  ON public.produtos (proxima_verificacao);

CREATE INDEX IF NOT EXISTS idx_produtos_marketplace_status
  ON public.produtos (marketplace, status);

CREATE INDEX IF NOT EXISTS idx_produtos_item_id
  ON public.produtos (item_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_produtos_modtime'
  ) THEN
    CREATE TRIGGER update_produtos_modtime
      BEFORE UPDATE ON public.produtos
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.monitored_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_title TEXT,
  image_url TEXT,
  baseline_price NUMERIC(10,2),
  last_notified_price NUMERIC(10,2),
  last_notified_at TIMESTAMPTZ,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS monitored_items_user_product_key
  ON public.monitored_items (user_id, product_id);

ALTER TABLE public.monitored_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monitored_items'
  ) THEN
    CREATE POLICY "Users can manage their monitored items"
      ON public.monitored_items
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_monitored_items_modtime'
  ) THEN
    CREATE TRIGGER update_monitored_items_modtime
      BEFORE UPDATE ON public.monitored_items
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

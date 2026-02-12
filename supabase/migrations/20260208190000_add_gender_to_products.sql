ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS gender TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_gender_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_gender_check
      CHECK (gender IS NULL OR gender IN ('masculino', 'feminino'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_category_gender_idx
ON public.products (category_id, gender);

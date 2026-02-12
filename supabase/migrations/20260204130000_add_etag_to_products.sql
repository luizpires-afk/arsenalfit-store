ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS etag text;

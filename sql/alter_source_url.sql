-- Adiciona coluna de origem para scraping (link completo do produto)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS source_url TEXT;

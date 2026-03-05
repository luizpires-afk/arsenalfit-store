# SEO Automation (Products, Categories, Programmatic Pages, Sitemap)

## Product page SEO

`/produto/:slug` now uses dynamic SEO with:

- SEO title: `{product_title} com desconto | Ofertas Fitness`
- Meta description: `Confira {product_title} com desconto no Mercado Livre. Compare preços e veja as melhores ofertas fitness.`
- Canonical URL
- OpenGraph tags (`og:title`, `og:description`, `og:type`, `og:image`, `og:url`)

## Category SEO pages

New SEO routes compatible with React + Vite routing:

- `/fitness/halteres`
- `/fitness/whey`
- `/fitness/bicicleta-ergometrica`
- `/fitness/esteira`

Each page lists active products ordered by `product_score` (fallback to `score_custo_beneficio` when needed).

## Sitemap automation

Sitemap generator script:

- `npm run generate_sitemap`

It includes:

- active product pages (`/produto/:slug`)
- SEO category pages (`/fitness/*`)
- programmatic SEO pages (`/:seo_slug`) from `seo_pages`

Sitemap scale rules:

- max `50000` URLs per sitemap file
- auto split into `sitemap-1.xml`, `sitemap-2.xml`, ... when needed
- `public/sitemap.xml` becomes sitemap index when split is required

Output:

- `public/sitemap.xml`

## Programmatic SEO engine (V5)

Engine script:

- `npm run programmatic_seo_engine`

Database tables:

- `seo_pages`
- `seo_page_products`
- `seo_page_metrics`

Generation behavior:

- merges keyword signals from `predicted_trends`, top products, and fitness defaults
- creates/upserts intent pages (up to `10000`)
- assigns top `20` products per page ordered by `rank_score`, `profit_score`, `discount_score`

Example slugs:

- `whey-protein-barato-promocao`
- `creatina-monohidratada-promocao`
- `equipamentos-academia-casa-promocao`

Health report:

- `npm run seo_system_health_report`

Metrics:

- `total_products`
- `visible_products`
- `seo_pages`
- `trending_products`
- `hot_deals`
- `top_profit_products`

## Daily update (cron)

Example daily cron at 02:15:

```cron
15 2 * * * cd /workspaces/arsenalfit-store && npm run generate_sitemap_daily >> logs/cron-seo-sitemap.log 2>&1
```

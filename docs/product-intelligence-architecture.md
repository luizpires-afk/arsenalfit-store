# Product Intelligence Auto System (React + Vite + Supabase)

## Strategic Upgrade V5 (Programmatic SEO Engine)

Esta versao consolida o sistema final com pages SEO programaticas para escala de 50k+ produtos.

## 1) Diagrama da Arquitetura (V5)

```mermaid
flowchart TD
  A[Google Trends] --> T[ai_trend_predictor]
  B[TikTok hashtags] --> T
  C[Shopee best sellers] --> T
  D[Mercado Livre search velocity] --> T

  T --> TS[(trend_signals)]
  T --> PT[(predicted_trends)]
  T --> P[(products.trend_score)]

  PT --> F[fitness_trend_discovery]
  F --> G[competitor_spy_engine]
  G --> H[catalog_ingest_auto]
  H --> P

  P --> I[product_validator_auto]
  I --> P

  P --> J[price_history_update]
  J --> PH[(price_history)]

  P --> K[deal_detector_30m]
  PH --> K
  K --> P

  P --> L[undervalued_product_detector]
  L --> P

  P --> M[recalculate_product_scores_auto]
  M --> P

  P --> AP[ai_profit_predictor]
  AP --> PM[(product_profit_metrics)]
  AP --> N[curate_store_products]
  N --> P

  P --> O[seo_page_generator]
  O --> PS[programmatic_seo_engine]
  PS --> SP[(seo_pages + seo_page_products + seo_page_metrics)]
  PS --> SX[/sitemap-products.xml + sitemap index]
```

## 2) Tabelas Novas (V5)

### trend_signals
- `id`
- `keyword`
- `source`
- `signal_strength`
- `growth_rate`
- `captured_at`

Campos de suporte:
- `volume`
- `created_at`

### predicted_trends
- `keyword`
- `trend_score`
- `confidence`
- `detected_at`

Campos de suporte:
- `id`
- `created_at`

### product_profit_metrics
- `id`
- `product_id`
- `profit_score`
- `sales_velocity`
- `competition_advantage`
- `trend_score`
- `predicted_conversion`
- `predicted_profit`
- `calculated_at`

### seo_pages
- `id`
- `slug`
- `title`
- `description`
- `keyword`
- `search_intent`
- `created_at`
- `updated_at`
- `is_active`

### seo_page_products
- `page_id`
- `product_id`
- `position`

### seo_page_metrics
- `page_id`
- `impressions`
- `clicks`
- `ctr`
- `updated_at`

### products (novos campos V4)
- `trend_score`
- `profit_score`
- `premium_product`
- `competitor_source`
- `seller_reputation`
- `seller_total_sales`
- `sales_velocity`
- `seller_competition`
- `undervalued_score`
- `is_undervalued`
- `seo_keywords`

## 3) Impacto no Ranking

Nova formula aplicada:

`rank_score = (profit_score * 0.40) + (viral_score * 0.20) + (discount_score * 0.15) + (undervalued_score * 0.15) + (conversion_rate * 0.10)`

Efeito esperado:
- produtos com maior chance de lucro ganham prioridade no ranqueamento final
- reduz exposicao de itens com baixo retorno esperado

## 4) Impacto na Descoberta de Produtos

- `fitness_trend_discovery` passa a carregar `predicted_trends` antes da busca padrao
- keywords preditas entram no pool de descoberta e antecipam ingestao
- reduz dependencia de tendencias ja saturadas

## 5) Pipeline Final (V5)

1. `ai_trend_predictor`
2. `fitness_trend_discovery`
3. `competitor_spy_engine`
4. `catalog_ingest_auto`
5. `product_validator_auto`
6. `price_history_update`
7. `deal_detector_30m`
8. `undervalued_product_detector`
9. `recalculate_product_scores_auto`
10. `ai_profit_predictor`
11. `curate_store_products`
12. `seo_page_generator`
13. `programmatic_seo_engine`

## 6) Cron do AI Profit Predictor

- frequencia efetiva: a cada 2 horas
- implementacao: `ai_profit_predictor` roda no pipeline de 30 min, mas tem guarda interna `--min-run-interval-hours 2`

## 7) Escala Programmatica

- alvo operacional: 50.000 produtos
- vitrine principal: 1.000 produtos visiveis
- SEO programatico: ate 10.000 paginas de intencao
- sitemap com particionamento de 50.000 URLs por arquivo

## 8) Impacto na Curadoria Top 1000

- `profit_score < 0.4`: produto nao entra na vitrine
- `profit_score > 0.8`: produto marcado como `premium_product`
- top 1000 fica orientado a potencial comercial e nao apenas tracao

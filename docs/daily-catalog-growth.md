# Daily Catalog Growth

## Objetivo

Adicionar produtos novos todos os dias em volume controlado, mantendo:
- produtos antigos ativos preservados;
- novos produtos em `standby`/pendente ate validacao de afiliado;
- prioridade maior para suplementos.

## Configuracao

Arquivo: `config/daily_catalog_config.json`
Arquivo do filtro de relevancia: `config/catalog_search_filter.json`

- `dailyQuotas` por categoria (min/max)
- `maxRuntimeMs` tempo maximo por execucao do ingest diario
- `maxBrandPerDay` limite por marca no dia
- `candidatePoolSize` tamanho do pool de candidatos por mapeamento
- parametros de preco/rate limit documentados no mesmo arquivo
- `catalog_search_filter.json` controla blocklist/allowlist/regex/regras ambiguas por categoria

## Execucao manual

Usar quotas do arquivo:

```bash
npm run daily_import
```

Sobrescrever quotas no comando:

```bash
npm run daily_import -- --supplements 4 --accessories 3 --men_clothing 1 --women_clothing 1 --equipment 1
```

Dry-run:

```bash
npm run daily_import -- --dry-run
```

No dry-run, validar no JSON de saida:
- `filter_summary.accepted_count`
- `filter_summary.rejected_count`
- `filter_summary.top_rejection_reasons`
- `insufficient_accepted_candidates`
- `daily_checklist` (PASS/FAIL por item quando `daily_growth=true`)

## Checklist persistido

- A cada execucao diaria, o ingest salva um checklist em `daily_run_reports` com:
  - quotas planejadas vs inseridas
  - novos produtos em standby
  - validacoes `/sec/` nas ultimas 24h
  - consistencia de oferta (ativos com link `/sec/`)
  - saude de preco (pix/promocao/suspeitos)
  - saude de monitoramento (checks/backoff)
  - status do relatorio diario de precos

## Agendamento automatico

- Cron diario configurado para `08:30` em `America/Sao_Paulo` (`11:30 UTC`).
- Job: `catalog-ingest` chamando `private.invoke_catalog_ingest()` com `daily_growth=true`.

## Seguranca e estabilidade

- Price sync segue prioridade de fonte: `API_PIX -> SCRAPER -> API_BASE`.
- Rate limit por dominio com jitter, backoff exponencial em `429/403` e circuit breaker.
- TTL dinamico por segmento:
  - `HIGH_VOLATILITY` (tech/preco volatil): 30-60 min (`PRICE_SYNC_TTL_HIGH_VOLATILITY_MINUTES`, default 45)
  - `HIGH` (suplementos/top): 60-120 min
  - `MED`: 6-12h
  - `LOW`: 24-48h
- Produtos ativos nao sao desativados automaticamente pelas rotinas do robo.
- Filtro de relevancia e obrigatorio no discovery/ranking/selecao e usa fallback seguro se config externa estiver ausente.

## Relatorio diario de precos

Gerar manualmente:

```bash
npm run generate_daily_price_report
```

Reenviar por data:

```bash
npm run resend_daily_report -- --date 2026-02-20
```

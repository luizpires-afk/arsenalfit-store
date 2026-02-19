# Daily Catalog Growth

## Objetivo

Adicionar produtos novos todos os dias em volume controlado, mantendo:
- produtos antigos ativos preservados;
- novos produtos em `standby`/pendente ate validacao de afiliado;
- prioridade maior para suplementos.

## Configuracao

Arquivo: `config/daily_catalog_config.json`

- `dailyQuotas` por categoria (min/max)
- `maxRuntimeMs` tempo maximo por execucao do ingest diario
- `maxBrandPerDay` limite por marca no dia
- `candidatePoolSize` tamanho do pool de candidatos por mapeamento
- parametros de preco/rate limit documentados no mesmo arquivo

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

## Agendamento automatico

- Cron diario configurado para `08:30` em `America/Sao_Paulo` (`11:30 UTC`).
- Job: `catalog-ingest` chamando `private.invoke_catalog_ingest()` com `daily_growth=true`.

## Seguranca e estabilidade

- Price sync segue prioridade de fonte: `API_PIX -> SCRAPER -> API_BASE`.
- Rate limit por dominio com jitter, backoff exponencial em `429/403` e circuit breaker.
- Produtos ativos nao sao desativados automaticamente pelas rotinas do robo.

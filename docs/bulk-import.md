# Bulk Import (Catalog Ingest)

## Rodar importacao massiva de hoje

```bash
npm run bulk_import -- --supplements 60 --accessories 25 --equipment 20 --men_clothing 20 --women_clothing 20
```

Observacoes:
- O comando ja envia `bulk_import=true`.
- Os alvos por categoria ativam filtro por `site_categories` automaticamente.
- Produtos novos entram em `standby` (pendente de validacao afiliado), sem desativar ativos antigos.

## Flags uteis

- `--dry-run`: valida coleta/curadoria sem gravar.
- `--max-runtime 220000`: limite de tempo do ciclo.
- `--max-mappings 30`: aumenta mappings por execucao.
- `--max-items 120`: aumenta itens por mapping (respeita hard cap do backend).

Exemplo:

```bash
npm run bulk_import -- --dry-run --supplements 20 --accessories 10 --equipment 10 --men_clothing 10 --women_clothing 10
```

## Ajuste seguro de limites de preco

- `PRICE_SYNC_RATE_MIN_INTERVAL_SECONDS` (recomendado: `12`)
- `PRICE_SYNC_RATE_MAX_INTERVAL_SECONDS` (recomendado: `20`)
- `PRICE_SYNC_CIRCUIT_ERROR_THRESHOLD` (recomendado: `5`)
- `PRICE_SYNC_CIRCUIT_OPEN_SECONDS` (recomendado: `900` a `1800`)

## TTL por prioridade (configuracao default)

- `HIGH`: 120 min
- `MED`: 720 min
- `LOW`: 2160 min

Esses valores ficam em `price_check_config` e podem ser ajustados sem alterar codigo.

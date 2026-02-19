# Catalog Cleanup And Unblock

## Objetivo

Limpar duplicados e destravar produtos validos sem regressao:
- reativa itens validos que ficaram inativos/bloqueados;
- marca duplicados e fontes invalidas com motivo;
- registra saude do catalogo (`data_health_status`).

## Comandos

Dry-run (nao grava):

```bash
npm run catalog_cleanup_and_unblock -- --dry-run
```

Aplicar alteracoes:

```bash
npm run catalog_cleanup_and_unblock -- --apply
```

Opcional:

```bash
npm run catalog_cleanup_and_unblock -- --apply --max-failures-before-api-missing 4
```

## Relatorio retornado

- `reactivated_count`
- `merged_duplicates_count`
- `invalidated_count`
- `api_missing_count`
- `scrape_failed_count`
- `suspect_price_count`
- `sample_actions`

## Regras principais

- Produto antigo valido nao deve ser desativado automaticamente.
- Duplicado nao e apagado; fica inativo com motivo e canonicidade registrada.
- Fonte invalida (sem ML id/permalink valido) vai para `INVALID_SOURCE`.
- Falha repetida de API/scraper gera `API_MISSING`/`SCRAPE_FAILED`.

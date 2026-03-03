# Reactivation Operational Close Runner

Runner idempotente para fechamento operacional da reativação automática com trilha de auditoria.

## Uso

```bash
npm run -s reactivation_operational_close -- \
  --limit 800 \
  --window-hours 72 \
  --source fechamento_operacional_20260303 \
  --audit-source fechamento_operacional_20260303 \
  --out-prefix logs/reactivation-operational-close
```

## Opções

- `--env`: caminho do env do runner (default `supabase/functions/.env.scheduler`)
- `--limit`: limite de candidatos na função de reativação
- `--window-hours`: janela de elegibilidade e auditoria
- `--source`: source enviado para a função de reativação
- `--audit-source`: filtro de auditoria por source (default: valor de `--source`)
- `--audit-note`: filtro opcional adicional por note
- `--out-prefix`: prefixo dos artefatos
- `--project-ref`: project ref para fallback SQL administrativo
- `--help`: exibe ajuda do script

## Comportamento

1. Coleta snapshot BEFORE (status, standby/inativo por motivo, elegíveis)
2. Executa reativação via RPC
3. Se ocorrer `admin_required`, faz fallback para SQL administrativo suportado no projeto
4. Coleta snapshot AFTER
5. Consolida auditoria em `product_admin_actions` por janela/source/note
6. Exporta JSON e CSV com diff e reconciliação

## Saídas

- `<out-prefix>.json`
- `<out-prefix>.csv`
- `<out-prefix>-reactivated-products.csv`

Campos de auditoria no JSON:

- `admin_actions_count`
- `admin_actions_by_source`
- `admin_actions_last_execution_count`
- `reconciliation.effectively_reactivated_runner`
- `reconciliation.reactivated_via_admin_sql`
- `reconciliation.reconciled_reactivated_total`

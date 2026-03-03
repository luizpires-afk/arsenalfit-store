# Validação de Afiliado em Lote (Mercado Livre)

Este fluxo mantém ordem 1:1 entre URLs de origem e links `/sec/`, com rastreabilidade JSON/CSV.

## Fluxo operacional recomendado

1. Listar **todos os não validados** (com motivo/status):

```bash
npm run list_unvalidated_affiliates -- --out-prefix logs/affiliate-unvalidated-list
```

2. Abrir lote de exportação ordenado (máx. 30 por chamada do RPC):

```bash
npm run export_standby_batch -- --limit 30 --source cli_affiliate_ops --out-prefix logs/affiliate-batch-export
```

3. Inspecionar lote aberto e confirmar ordem:

```bash
npm run open_affiliate_batch -- --batch-id <UUID> --out-prefix logs/affiliate-batch-open
```

4. Aplicar links `/sec/` na mesma ordem (1 por linha):

```bash
npm run apply_affiliate_batch -- --batch-id <UUID> --links-file links-sec.txt --out-prefix logs/affiliate-batch-apply
```

5. Reabrir relatório final do lote (sucesso/erro por linha):

```bash
npm run open_affiliate_batch -- --batch-id <UUID> --out-prefix logs/affiliate-batch-final
```

Observação: o apply aceita tanto URL completa quanto somente código (`2RvQEG4`) e normaliza para `https://mercadolivre.com/sec/<codigo>` automaticamente.

## Fluxo normal vs fallback (gate vazio)

### Fluxo normal

```bash
npm run -s export_standby_batch -- --limit 30 --source ops_affiliate_daily --out-prefix logs/affiliate-batch-export --json
```

### Fluxo fallback quando export vier vazio

Quando `total=0`, habilite o fallback automático a partir de `pending-affiliate-links`:

```bash
npm run -s export_standby_batch -- \
	--limit 30 \
	--source ops_affiliate_daily \
	--fallback-from-pending true \
	--category suplementos \
	--max-items 30 \
	--out-prefix logs/affiliate-batch-export \
	--json
```

- `--fallback-from-pending true`: cria/reusa lote manual rastreável quando o export vier vazio.
- `--category suplementos|acessorios|demais|all`: define o bloco de pendentes a consumir.
- `--max-items 30`: define o limite estável de seleção no fallback.

Artefatos esperados do fallback:

- `logs/affiliate-batch-export-fallback.json`
- `logs/affiliate-batch-export-fallback.csv`
- `logs/affiliate-batch-export-fallback.txt`

## Comandos prontos (operação diária)

### Ciclo diário em um comando (pending → export fallback → apply → open)

Comando padrão da equipe (já com autocorreção e arquivo reserva):

```bash
npm run -s cycle_affiliate_fallback_daily_team -- --run-id daily-$(date +%F-%H%M) --json
```

```bash
npm run -s cycle_affiliate_fallback_daily -- \
	--links-file links-sec-fresh.txt \
	--category suplementos \
	--limit 30 \
	--max-items 30 \
	--rotate-links true \
	--json
```

O runner executa em sequência:

1. `pending_affiliate_links`
2. `export_standby_batch --fallback-from-pending true`
3. `affiliate_validation_apply_batch`
4. `affiliate_validation_open_batch`

Artefatos de resumo automático:

- `logs/affiliate-fallback-daily-summary.json`
- `logs/affiliate-fallback-daily-summary.txt`
- `logs/affiliate-fallback-daily-summary-<run-id>.json`
- `logs/affiliate-fallback-daily-summary-<run-id>.txt`

Rotação automática de links:

- `--rotate-links true` (padrão): move para o final do arquivo as `N` linhas consumidas no apply.
- Se `N` for igual ao total de linhas do arquivo, a rotação vira `noop` (arquivo permanece igual) e isso é registrado no resumo.
- `--strict-count false` (padrão): permite execução parcial quando há menos links do que itens no lote.
- `--allow-partial true` (padrão): mantém posições sem link como `missing_input_line`.
- `--auto-repair-on-invalid true` (padrão): se houver `invalid` por `affiliate_link_already_used`, executa automaticamente uma segunda rodada (`export → apply → open`) para correção.
- `--auto-repair-links-file <arquivo>` (opcional): usa um pool separado de links na rodada automática de correção.
- `--force-correction true`: força tentativa de correção para qualquer `invalid` (não só duplicidade de link já usado).
- `--require-correction true`: falha o comando se houver `invalid` inicial e a correção não zerar inválidos.

Boas práticas operacionais:

- Use `--run-id` explícito (ex.: data/hora) para facilitar auditoria dos artefatos da rodada.
- Mantenha um arquivo de links com mais linhas do que o consumo diário para garantir rotação efetiva.
- Para máxima taxa de correção, configure um `--auto-repair-links-file` com códigos não utilizados.
- Consulte no resumo os campos `auto_repair_attempted`, `auto_repair_corrected` e `auto_repair_batch_id` para confirmar a autocorreção.
- O comando `cycle_affiliate_fallback_daily_team` já roda em modo estrito (força + exige correção).

1. Listar pendentes por categoria (suplementos/acessórios/demais):

```bash
npm run -s pending_affiliate_links -- --limit 800
```

2. Abrir lote ordenado:

```bash
npm run -s export_standby_batch -- --limit 30 --source ops_affiliate --out-prefix logs/affiliate-batch-export
```

3. Aplicar lote com códigos/links:

```bash
npm run -s affiliate_validation_apply_batch -- --batch-id <UUID> --links-file links.txt --json --out-prefix logs/affiliate-validation-apply
```

4. Validar resultado do lote:

```bash
npm run -s affiliate_validation_open_batch -- --batch-id <UUID> --out-prefix logs/affiliate-validation-open
```

## Regras e validações de entrada

- `--batch-id` precisa ser UUID válido.
- Links aceitos: Mercado Livre `/sec/`, `meli.la` e social affiliate ML.
- Duplicados de links são rejeitados antes de enviar ao RPC.
- Por padrão, contagem é estrita (`links == total do lote`).
- Use `--allow-partial` para permitir faltantes.
- Use `--allow-extra` para permitir excedentes.
- Use `--non-strict-count` para relaxar validação de quantidade.

## Idempotência e mensagens acionáveis

- Se o lote não estiver `OPEN`, `apply_affiliate_batch` entra em modo `noop` e retorna relatório sem alterar dados.
- Erros de permissão, lote inexistente ou entrada inválida retornam mensagens objetivas para ação imediata.

## Artefatos gerados

- `list_unvalidated_affiliates`:
	- `logs/affiliate-unvalidated-list.json`
	- `logs/affiliate-unvalidated-list.csv`
- `export_standby_batch --out-prefix ...`:
	- `<prefix>.txt` (source URLs em ordem)
	- `<prefix>.json`
	- `<prefix>.csv`
- `open_affiliate_batch --out-prefix ...`:
	- `<prefix>.txt`
	- `<prefix>.json`
	- `<prefix>.csv`
- `apply_affiliate_batch --out-prefix ...`:
	- `<prefix>.json`
	- `<prefix>.csv`
  - `<prefix>.txt`
	- `<prefix>-integrity.csv`

## Playbook de falha e recuperação

1. **Erro de permissão (`admin_required`)**
	- Confirme execução com `service_role` ou usuário admin.
	- Reexecute o comando e valide no JSON se `ok=true`.

2. **Lote não aberto (`batch_not_open:*`)**
	- O runner entra em `noop` (idempotente), sem mutar dados.
	- Gere novo lote com `export_standby_batch` e aplique novamente.

3. **Erro de contagem/ordem de links**
	- Ajuste arquivo de entrada para `N` links exatos do lote.
	- Se operação parcial for intencional, use `--allow-partial`.
	- Se houver excedentes intencionais, use `--allow-extra`.

4. **Links inválidos/duplicados**
	- Corrija as linhas indicadas pelo erro no JSON.
	- Reenvie somente com links MLB `/sec/` válidos e únicos.

5. **Integridade pós-aplicação falhou**
	- Verifique `<prefix>-integrity.csv` para itens com `integrity_ok=false`.
	- Reabrir lote com `open_affiliate_batch` para confirmar `error_message` por linha.
	- Corrigir links e reaplicar em lote novo.

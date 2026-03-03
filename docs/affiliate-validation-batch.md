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

Observação: o apply aceita tanto URL completa quanto somente código (`2RvQEG4`) e normaliza para `https://mercadolivre.com/sec/<codigo>` automaticamente.

## Comandos prontos (operação diária)

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

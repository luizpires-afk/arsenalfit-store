# Validacao de Afiliado em Lote (Batch)

Fluxo recomendado para manter ordem e evitar descasamento:

1. No Admin, aba `Afiliados`, clique em `Gerar lote e copiar 30 URLs`.
2. O painel cria um `batch_id` imutavel e copia as URLs fonte em ordem.
3. Cole essas URLs no gerador do Mercado Livre e obtenha os links curtos `/sec/` na mesma ordem.
4. Cole os `/sec/` no campo de lote e clique em `Validar em lote na ordem`.

Regras de aplicacao:

- Cada link e aplicado ao `product_id` da mesma posicao do `batch_id`.
- Menos links que o batch: aplica o que veio e o resto permanece pendente.
- Mais links que o batch: excedentes sao ignorados e logados.
- Link invalido: aquela linha vira invalida sem quebrar o lote inteiro.

## Comandos de suporte (CLI)

Exportar lote (30 por padrao):

```bash
npm run export_standby_batch
```

Opcoes:

```bash
npm run export_standby_batch -- --limit 30 --source cli --json
```

Aplicar links em lote (arquivo texto, 1 link por linha):

```bash
npm run apply_affiliate_batch -- --batch-id <UUID> --links-file links.txt
```

Ou via stdin:

```bash
cat links.txt | npm run apply_affiliate_batch -- --batch-id <UUID>
```

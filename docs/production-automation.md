# Production Automation

## Objetivo
Automatizar rotinas de producao (produtos, validacao, SEO e monitoramento) com um unico runner:

- `scripts/ops-production-runner.cjs`

Ele executa comandos em sequencia, para no primeiro erro por padrao e gera relatorio JSON em `logs/`.

## Modos

- `post-deploy`: valida build/test + auditorias chave
- `daily`: robot diario + monitoramento
- `weekly`: robot estrito + auditorias adicionais
- `full`: combina todos os modos

## Comandos npm

```bash
npm run ops_production_post_deploy
npm run ops_production_daily
npm run ops_production_weekly
npm run ops_production_full
npm run ops_production_dry_run
```

Runner generico:

```bash
npm run ops_production -- --mode daily
npm run ops_production -- --mode weekly --continue-on-error
npm run ops_production -- --mode full --dry-run
```

## Relatorio

Cada execucao salva um arquivo:

- `logs/ops-production-<mode>-<timestamp>.json`

Campos principais:

- `ok`: true/false
- `steps[]`: comando, tempo, status e exit code
- `started_at`, `finished_at`

## Agenda recomendada (Windows)

Exemplo de agendamento diario as 06:30:

```powershell
schtasks /Create /SC DAILY /TN "ArsenalFit Ops Daily" /TR "cmd /c cd /d C:\Users\LUIZ\arsenalfit-store && npm run ops_production_daily" /ST 06:30 /F
```

Exemplo semanal (domingo 07:00):

```powershell
schtasks /Create /SC WEEKLY /D SUN /TN "ArsenalFit Ops Weekly" /TR "cmd /c cd /d C:\Users\LUIZ\arsenalfit-store && npm run ops_production_weekly" /ST 07:00 /F
```

## Notas

- Padrao: fail-fast (para no primeiro erro).
- Use `--continue-on-error` para rodar tudo mesmo com falhas.
- Antes de automatizar em horario fixo, rode `ops_production_dry_run` e depois `ops_production_daily` manualmente.

# MeuSiteLoja (AUDITADO)

## O que foi padronizado
- Alias `@/` habilitado (Vite + TS)
- `App.tsx` movido para `src/app/App.tsx` (padrão Vite/React)
- `.env` sanitizado e `.env.example` criado
- `.gitignore` atualizado para ignorar `.env`
- Imports relativos dentro de `src/` convertidos para `@/` quando possível
- Forçado `forceConsistentCasingInFileNames` no TypeScript

## Como rodar
1) Copie `.env.example` para `.env` e preencha:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

2) Instale e rode:
```bash
npm install
npm run dev
```

## Produção (Vercel)
- Configure as mesmas envs no painel da Vercel
- Rode `npm run build` localmente para validar


## Supabase (configurado neste ZIP)
- **Project ref:** `pixqurduxqfcujfadkbw`
- **URL correta para o app (VITE_SUPABASE_URL):** `https://pixqurduxqfcujfadkbw.supabase.co`
- O link do dashboard (https://supabase.com/dashboard/project/pixqurduxqfcujfadkbw) **não** é a URL que o app usa.

### SQL (schema + RLS)
Arquivo: `supabase/schema.sql`
- Cole e execute no SQL Editor do Supabase (ou rode via migrations).

### Segurança
- Este ZIP inclui `.env` para facilitar testes locais.
- **Em produção (Vercel), configure as envs no painel** e não commite `.env`.

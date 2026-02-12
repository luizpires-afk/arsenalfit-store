# ArsenalFit — E-mail de Verificação e Recuperação

Este documento resume as variáveis de ambiente e o fluxo de testes do novo sistema de e-mails customizados (Resend) para verificação de conta e recuperação de senha.

## Variáveis de ambiente (Netlify / servidor)

- `SITE_URL`  
  URL pública do site, ex.: `https://www.arsenalfit.com`

- `RESEND_API_KEY`  
  Chave da Resend para envio dos e-mails.

- `EMAIL_FROM`  
  Remetente do e-mail, ex.: `ArsenalFit <no-reply@seudominio.com>`

- `TOKEN_PEPPER`  
  String secreta usada para hash dos tokens (não expor no client).

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  
  Necessário para admin API (somente no servidor).

### Opcionais (rate limit)
- `AUTH_EMAIL_RATE_LIMIT` (padrão: `3`)
- `AUTH_EMAIL_RATE_WINDOW_MINUTES` (padrão: `60`)

## Banco de dados (Supabase)

Aplicar a migration:

```
supabase db push
```

Ela cria:
- `auth_email_tokens`
- `auth_email_rate_limits`
- `auth_email_logs`

## Endpoints (Netlify Functions)

- `POST /api/auth-send-verification`
- `POST /api/auth-send-recovery`
- `POST /api/auth-consume-token`
- `POST /api/auth-reset-password`

## Testes rápidos

1. **Cadastro**
   - Crie uma conta no `/cadastro`.
   - Verifique se recebeu o e-mail “Confirme seu e-mail”.
   - Clique no link e valide redirecionamento para `/`.

2. **Recuperação de senha**
   - Vá em `/login` > “Esqueceu a senha?”.
   - Envie e-mail de recuperação.
   - Clique no link e redefina a senha.
   - Deve logar automaticamente e ir para `/`.

3. **Rate limit**
   - Envie mais de 3 solicitações por hora para o mesmo e-mail/IP.
   - Deve retornar “Tente novamente em alguns minutos”.

4. **Segurança**
   - Token inválido ou expirado deve exibir mensagem e CTA para reenviar.


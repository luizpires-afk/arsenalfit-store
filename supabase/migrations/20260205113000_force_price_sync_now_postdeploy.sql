-- Force next price sync to run immediately (post-deploy)
update public.products
set next_check_at = now()
where marketplace = 'mercadolivre'
  and status != 'paused';

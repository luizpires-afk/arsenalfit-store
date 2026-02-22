-- Endurece o gate de validacao SEC em standby:
-- somente itens HEALTHY entram no batch de validacao.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.export_standby_affiliate_batch(integer,text)'::regprocedure)
    into v_def;

  if v_def is null then
    raise exception 'export_standby_affiliate_batch_not_found';
  end if;

  v_def := replace(
    v_def,
    'coalesce(p.data_health_status, ''HEALTHY'') not in (''PRICE_MISMATCH'', ''SUSPECT_PRICE'', ''API_MISSING'')',
    'coalesce(p.data_health_status, ''HEALTHY'') = ''HEALTHY'''
  );

  execute v_def;
end
$$;

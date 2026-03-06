begin;

create or replace function public.apply_discovery_batch_decision_atomic(
  p_candidate_ids uuid[],
  p_next_status text,
  p_actor text default 'admin_ui',
  p_reason text default null,
  p_operation_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation_id text := coalesce(
    nullif(trim(coalesce(p_operation_id, '')), ''),
    format('batch-%s-%s', p_next_status, floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
  );
  v_event_type text;
  v_target_count integer;
  v_existing_count integer;
  v_updated_count integer;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;

  if coalesce(array_length(p_candidate_ids, 1), 0) = 0 then
    raise exception 'candidate_ids_empty';
  end if;

  if p_next_status not in ('approved', 'rejected', 'saved') then
    raise exception 'next_status_invalid';
  end if;

  if p_next_status = 'rejected' and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'reject_reason_required';
  end if;

  v_event_type := p_next_status;

  with distinct_ids as (
    select distinct unnest(p_candidate_ids)::uuid as id
  ), targets as (
    select c.id
    from public.discovery_candidates c
    join distinct_ids d on d.id = c.id
    for update
  )
  select count(*) into v_target_count from targets;

  if v_target_count <> (
    select count(distinct unnest(p_candidate_ids)::uuid)
  ) then
    raise exception 'candidate_not_found';
  end if;

  select count(*) into v_existing_count
  from public.discovery_candidate_events e
  where e.candidate_id = any(p_candidate_ids)
    and e.event_type = v_event_type
    and e.event_payload ->> 'operation_id' = v_operation_id;

  if v_existing_count = v_target_count then
    return jsonb_build_object(
      'operation_id', v_operation_id,
      'target_count', v_target_count,
      'updated_count', 0,
      'skipped_count', v_target_count,
      'next_status', p_next_status,
      'idempotent', true
    );
  elsif v_existing_count > 0 then
    raise exception 'operation_id_partially_applied';
  end if;

  with locked as (
    select c.id, c.status
    from public.discovery_candidates c
    where c.id = any(p_candidate_ids)
    for update
  ), updated as (
    update public.discovery_candidates c
    set
      status = p_next_status,
      reviewed_at = now(),
      updated_at = now()
    from locked l
    where c.id = l.id
    returning c.id, l.status as previous_status
  ), inserted as (
    insert into public.discovery_candidate_events (
      candidate_id,
      event_type,
      previous_status,
      next_status,
      event_payload,
      actor
    )
    select
      u.id,
      v_event_type,
      u.previous_status,
      p_next_status,
      jsonb_build_object(
        'reason', case when p_next_status = 'rejected' then nullif(trim(coalesce(p_reason, '')), '') else null end,
        'operation_id', v_operation_id,
        'context', jsonb_build_object(
          'source', 'admin_discovery_queue_batch_atomic',
          'mode', 'transaction_wrapper'
        )
      ),
      nullif(trim(coalesce(p_actor, '')), '')
    from updated u
    returning id
  )
  select count(*) into v_updated_count from updated;

  if v_updated_count <> v_target_count then
    raise exception 'deterministic_rollback_guard_failed';
  end if;

  return jsonb_build_object(
    'operation_id', v_operation_id,
    'target_count', v_target_count,
    'updated_count', v_updated_count,
    'skipped_count', 0,
    'next_status', p_next_status,
    'idempotent', false
  );
end;
$$;

grant execute on function public.apply_discovery_batch_decision_atomic(uuid[], text, text, text, text) to authenticated;

commit;

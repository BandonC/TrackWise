-- TrackWise DB invariants
--
-- Asserts the day 1-6 schema is intact: tables, RLS, CHECK constraints,
-- indexes, triggers, views (with security_invoker), the find_similar_applications
-- RPC, extensions, and the vault secrets needed by request_embedding().
--
-- Each `assert` block raises an exception on failure. A clean run prints
-- "ALL DB INVARIANTS PASSED".
--
-- Run via:
--   supabase db query --file test/db-invariants.sql --linked
--   -- or paste into the SQL editor in the Supabase dashboard
--   -- -- or via psql against the project connection string

do $$
declare
  n int;
  v text;
begin
  -- ============================================================
  -- Extensions
  -- ============================================================
  select count(*) into n from pg_extension where extname = 'vector';
  if n <> 1 then raise exception 'extension vector not installed'; end if;

  select count(*) into n from pg_extension where extname = 'pg_net';
  if n <> 1 then raise exception 'extension pg_net not installed'; end if;

  -- ============================================================
  -- Tables exist
  -- ============================================================
  select count(*) into n from pg_tables
   where schemaname = 'public' and tablename in ('applications', 'application_events');
  if n <> 2 then raise exception 'expected 2 core tables, found %', n; end if;

  -- ============================================================
  -- RLS enabled
  -- ============================================================
  select count(*) into n from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in ('applications', 'application_events')
     and c.relrowsecurity = true;
  if n <> 2 then raise exception 'RLS not enabled on both core tables (got %)', n; end if;

  -- ============================================================
  -- Policies (one for-all per table)
  -- ============================================================
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'applications';
  if n < 1 then raise exception 'no RLS policy on applications'; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'application_events';
  if n < 1 then raise exception 'no RLS policy on application_events'; end if;

  -- Verify policies have both USING and WITH CHECK (qual + with_check non-null)
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'applications'
     and qual is not null and with_check is not null;
  if n < 1 then raise exception 'applications policy missing using or with_check'; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'application_events'
     and qual is not null and with_check is not null;
  if n < 1 then raise exception 'application_events policy missing using or with_check'; end if;

  -- ============================================================
  -- CHECK constraints
  -- ============================================================
  select count(*) into n from pg_constraint
   where conrelid = 'public.applications'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%status%applied%screening%interview%offer%rejected%';
  if n <> 1 then raise exception 'applications.status CHECK constraint missing or altered'; end if;

  select count(*) into n from pg_constraint
   where conrelid = 'public.application_events'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%event_type%created%status_change%note_added%';
  if n <> 1 then raise exception 'application_events.event_type CHECK constraint missing'; end if;

  -- ============================================================
  -- Indexes
  -- ============================================================
  select count(*) into n from pg_indexes
   where schemaname = 'public'
     and tablename = 'applications'
     and indexname in ('applications_user_status_idx', 'applications_user_applied_at_idx');
  if n <> 2 then raise exception 'expected 2 b-tree indexes on applications, found %', n; end if;

  -- ============================================================
  -- Triggers
  -- ============================================================
  select count(*) into n from pg_trigger
   where tgrelid = 'public.applications'::regclass
     and tgname in (
       'on_application_created',
       'on_status_change',
       'on_application_inserted_embed',
       'on_application_updated_embed',
       'on_application_embedding_change_invalidate_fit'
     )
     and not tgisinternal;
  if n <> 5 then raise exception 'expected 5 triggers on applications, found %', n; end if;

  -- Trigger functions are defined
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('log_application_created', 'log_status_change', 'request_embedding');
  if n <> 3 then raise exception 'expected 3 trigger functions, found %', n; end if;

  -- request_embedding must be security definer
  select count(*) into n from pg_proc where proname = 'request_embedding' and prosecdef = true;
  if n <> 1 then raise exception 'request_embedding must be SECURITY DEFINER'; end if;

  -- ============================================================
  -- Views (must have security_invoker = on)
  -- ============================================================
  select count(*) into n from pg_views
   where schemaname = 'public'
     and viewname in ('v_response_rate', 'v_time_to_response', 'v_response_by_source');
  if n <> 3 then raise exception 'expected 3 analytics views, found %', n; end if;

  for v in
    select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind = 'v'
       and c.relname in ('v_response_rate', 'v_time_to_response', 'v_response_by_source')
  loop
    if not exists (
      select 1 from pg_class c
        join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relname = v
         and (c.reloptions::text ilike '%security_invoker=on%'
              or c.reloptions::text ilike '%security_invoker=true%')
    ) then
      raise exception 'view % missing security_invoker=on', v;
    end if;
  end loop;

  -- ============================================================
  -- find_similar_applications RPC
  -- ============================================================
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'find_similar_applications';
  if n <> 1 then raise exception 'find_similar_applications RPC missing'; end if;

  -- Must be security invoker (prosecdef = false), so caller's RLS applies
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'find_similar_applications'
     and p.prosecdef = false;
  if n <> 1 then raise exception 'find_similar_applications must be SECURITY INVOKER'; end if;

  -- ============================================================
  -- Vault secrets for the embedding trigger
  -- ============================================================
  select count(*) into n from vault.decrypted_secrets
   where name in ('edge_function_url', 'edge_function_secret');
  if n <> 2 then raise exception 'vault secrets edge_function_url + edge_function_secret missing (found %)', n; end if;

  -- ============================================================
  -- Embedding column dimension
  -- ============================================================
  select count(*) into n from information_schema.columns
   where table_schema = 'public'
     and table_name = 'applications'
     and column_name = 'embedding';
  if n <> 1 then raise exception 'applications.embedding column missing'; end if;

  -- applications.embedding must be vector(1024) (voyage-3 output dim).
  -- Guards against a future model swap that forgets to alter the column.
  perform 1 from pg_attribute
   where attrelid = 'public.applications'::regclass
     and attname  = 'embedding'
     and format_type(atttypid, atttypmod) = 'vector(1024)';
  if not found then
    raise exception 'applications.embedding must be vector(1024) (voyage-3)';
  end if;

  -- ============================================================
  -- Clustering (day 9–10)
  -- ============================================================
  -- clusters table exists
  select count(*) into n from pg_tables
   where schemaname = 'public' and tablename = 'clusters';
  if n <> 1 then raise exception 'clusters table missing'; end if;

  -- RLS enabled
  select count(*) into n from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'clusters'
     and c.relrowsecurity = true;
  if n <> 1 then raise exception 'RLS not enabled on clusters'; end if;

  -- Policy has both using + with_check, scoped to auth.uid()
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'clusters'
     and qual is not null and with_check is not null
     and qual like '%auth.uid()%' and with_check like '%auth.uid()%';
  if n <> 1 then raise exception 'clusters policy missing or not auth.uid()-scoped'; end if;

  -- applications.cluster_id FK exists with ON DELETE SET NULL
  select count(*) into n from pg_constraint
   where conrelid = 'public.applications'::regclass
     and contype = 'f'
     and confrelid = 'public.clusters'::regclass
     and confdeltype = 'n';
  if n <> 1 then raise exception 'applications.cluster_id FK to clusters with ON DELETE SET NULL missing'; end if;

  -- View exists with security_invoker
  select count(*) into n from pg_views
   where schemaname = 'public' and viewname = 'v_response_rate_by_cluster';
  if n <> 1 then raise exception 'v_response_rate_by_cluster view missing'; end if;

  if not exists (
    select 1 from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relname = 'v_response_rate_by_cluster'
       and (c.reloptions::text ilike '%security_invoker=on%'
            or c.reloptions::text ilike '%security_invoker=true%')
  ) then
    raise exception 'v_response_rate_by_cluster missing security_invoker=on';
  end if;

  -- ============================================================
  -- Resumes (day 11)
  -- ============================================================
  -- Table exists
  select count(*) into n from pg_tables
   where schemaname = 'public' and tablename = 'resumes';
  if n <> 1 then raise exception 'resumes table missing'; end if;

  -- RLS enabled
  select count(*) into n from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'resumes'
     and c.relrowsecurity = true;
  if n <> 1 then raise exception 'RLS not enabled on resumes'; end if;

  -- Policy has both using + with_check, scoped to auth.uid()
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'resumes'
     and qual is not null and with_check is not null
     and qual like '%auth.uid()%' and with_check like '%auth.uid()%';
  if n <> 1 then raise exception 'resumes policy missing or not auth.uid()-scoped'; end if;

  -- Partial unique index enforces one active resume per user
  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'resumes'
     and indexname = 'resumes_one_active_per_user';
  if n <> 1 then raise exception 'resumes_one_active_per_user partial unique index missing'; end if;

  -- resumes.embedding column was DROPPED in
  -- 20260519120100_resume_chunks_swap.sql -- resume embeddings now
  -- live on resume_chunks. Assert the column is GONE so a future
  -- migration that re-adds it has to think about why.
  select count(*) into n from information_schema.columns
   where table_schema = 'public'
     and table_name = 'resumes'
     and column_name = 'embedding';
  if n <> 0 then raise exception 'resumes.embedding should not exist (chunks replaced it)'; end if;

  -- Triggers
  select count(*) into n from pg_trigger
   where tgrelid = 'public.resumes'::regclass
     and tgname in (
       'on_resume_updated',
       'on_resume_inserted_embed',
       'on_resume_updated_embed'
     )
     and not tgisinternal;
  if n <> 3 then raise exception 'expected 3 triggers on resumes, found %', n; end if;

  -- request_resume_embedding must be security definer
  select count(*) into n from pg_proc
   where proname = 'request_resume_embedding' and prosecdef = true;
  if n <> 1 then raise exception 'request_resume_embedding must be SECURITY DEFINER'; end if;

  -- resume_fit_for_application RPC exists and is security invoker
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'resume_fit_for_application';
  if n <> 1 then raise exception 'resume_fit_for_application RPC missing'; end if;

  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'resume_fit_for_application'
     and p.prosecdef = false;
  if n <> 1 then raise exception 'resume_fit_for_application must be SECURITY INVOKER'; end if;

  -- Vault secret for the resume embedding trigger
  select count(*) into n from vault.decrypted_secrets
   where name = 'edge_function_resume_url';
  if n <> 1 then raise exception 'vault secret edge_function_resume_url missing'; end if;

  -- ============================================================
  -- Resume chunks (PR-C2)
  -- ============================================================
  -- Table exists
  select count(*) into n from pg_tables
   where schemaname = 'public' and tablename = 'resume_chunks';
  if n <> 1 then raise exception 'resume_chunks table missing'; end if;

  -- RLS enabled
  select count(*) into n from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'resume_chunks'
     and c.relrowsecurity = true;
  if n <> 1 then raise exception 'RLS not enabled on resume_chunks'; end if;

  -- Policy has both using + with_check, scoped to auth.uid()
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'resume_chunks'
     and qual is not null and with_check is not null
     and qual like '%auth.uid()%' and with_check like '%auth.uid()%';
  if n <> 1 then raise exception 'resume_chunks policy missing or not auth.uid()-scoped'; end if;

  -- FK to resumes with ON DELETE CASCADE so chunks die with the parent
  select count(*) into n from pg_constraint
   where conrelid = 'public.resume_chunks'::regclass
     and contype = 'f'
     and confrelid = 'public.resumes'::regclass
     and confdeltype = 'c';
  if n <> 1 then raise exception 'resume_chunks FK to resumes must be ON DELETE CASCADE'; end if;

  -- Unique (resume_id, ordinal) guards against duplicate ordinals
  -- if a fan-out insert ever runs twice.
  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'resume_chunks'
     and indexname = 'resume_chunks_resume_id_ordinal_key';
  if n <> 1 then raise exception 'unique index resume_chunks (resume_id, ordinal) missing'; end if;

  -- Embedding column is vector(1024) (voyage-3 output dim)
  perform 1 from pg_attribute
   where attrelid = 'public.resume_chunks'::regclass
     and attname  = 'embedding'
     and format_type(atttypid, atttypmod) = 'vector(1024)';
  if not found then
    raise exception 'resume_chunks.embedding must be vector(1024) (voyage-3)';
  end if;

  -- ============================================================
  -- score_external_job_resume RPC (PR-C2 returns top-K with chunks)
  -- ============================================================
  -- Must be security definer (called from service-role Edge Function
  -- context with an explicit p_user_id filter; RLS bypassed).
  select count(*) into n from pg_proc
   where proname = 'score_external_job_resume' and prosecdef = true;
  if n <> 1 then raise exception 'score_external_job_resume must be SECURITY DEFINER'; end if;

  -- ============================================================
  -- Resume-fit cache on applications (PR-C2)
  -- ============================================================
  -- Three cache columns landed in 20260520120000_resume_fit_rerank.sql;
  -- resume_fit_reasoning added in 20260520150000_resume_fit_reasoning.sql
  -- (PR-C3) so the Haiku tier's one-sentence explanation persists with
  -- the score.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'applications'
     and column_name in (
       'resume_fit_similarity',
       'resume_fit_section_label',
       'resume_fit_reasoning',
       'resume_fit_computed_at'
     );
  if n <> 4 then
    raise exception 'expected 4 resume-fit cache columns on applications, found %', n;
  end if;

  -- Row-local invalidation function + trigger.
  -- The trigger nulls the cache columns when applications.embedding
  -- changes (notes/role/company/job_description edit -> regenerated
  -- embedding).
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'invalidate_application_fit_cache';
  if n <> 1 then raise exception 'invalidate_application_fit_cache function missing'; end if;

  -- ============================================================
  -- applications.job_description (PR-D1)
  -- ============================================================
  -- Column added in 20260520160000_application_job_description.sql.
  -- The extension parsers populate it at save time; embedding flow
  -- concatenates it into the embedding source.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'applications'
     and column_name = 'job_description';
  if n <> 1 then raise exception 'applications.job_description column missing'; end if;

  -- Embedding trigger must watch job_description so edits re-embed.
  -- pg_trigger.tgattr lists the watched column attnums for UPDATE OF
  -- triggers; we verify the trigger exists and that job_description's
  -- attnum is in its watched set.
  select count(*) into n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
   where ns.nspname = 'public'
     and c.relname = 'applications'
     and t.tgname = 'on_application_updated_embed'
     and a.attname = 'job_description'
     and a.attnum = any(t.tgattr);
  if n <> 1 then
    raise exception 'on_application_updated_embed must watch job_description';
  end if;

  raise notice 'ALL DB INVARIANTS PASSED';
end
$$;

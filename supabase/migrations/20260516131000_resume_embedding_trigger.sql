-- ============================================================
-- Resume embedding trigger
--
-- Mirrors the request_embedding() pattern from
-- 20260514150000_semantic_search.sql, retargeted at the
-- generate-resume-embedding Edge Function.
--
-- The function URL is read from a separate vault entry
-- (edge_function_resume_url). The shared secret is the same
-- one used by generate-embedding (edge_function_secret) — both
-- functions verify the same x-internal-secret header.
--
-- Populate the URL secret out-of-band (one-off, not committed)
-- once the function is deployed:
--   select vault.create_secret('<url>', 'edge_function_resume_url');
-- ============================================================

create or replace function request_resume_embedding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url    text;
  fn_secret text;
begin
  select decrypted_secret into fn_url
    from vault.decrypted_secrets
    where name = 'edge_function_resume_url';

  select decrypted_secret into fn_secret
    from vault.decrypted_secrets
    where name = 'edge_function_secret';

  if fn_url is null or fn_secret is null then
    raise warning 'request_resume_embedding: vault secrets missing; skipping';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    body    := jsonb_build_object('resumeId', new.id),
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', fn_secret
    )
  );

  return new;
end;
$$;

-- ------------------------------------------------------------
-- Triggers
-- After insert: always embed.
-- After update of content: re-embed when the resume text changes.
-- Editing label / is_active does NOT re-embed.
-- ------------------------------------------------------------
create trigger on_resume_inserted_embed
  after insert on resumes
  for each row execute function request_resume_embedding();

create trigger on_resume_updated_embed
  after update of content on resumes
  for each row execute function request_resume_embedding();

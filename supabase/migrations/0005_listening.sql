-- ============================================================
-- Listening comprehension: same shape as reading (one passage, several
-- questions off passage_id), only audio_path differs — that split was already
-- the design intent in schema.sql (see its PASSAGES comment) and in
-- CLAUDE.md section 6. This migration is what makes the Postgres side match:
--
--   1. passages gains audio_path — NULL for reading, a file path/URL for
--      listening. Nothing reads it as a trust boundary; it's just data.
--   2. request_practice's reading branch (serve one whole passage plus all its
--      questions, picking the passage this user has worked through least)
--      applies just as much to listening, so p_type = 'listening' now takes
--      the same branch instead of falling into the plain "everything else"
--      path, which would return listening questions with no passage to pair
--      them with.
--   3. Both serving functions now select audio_path along with topic/body, so
--      it reaches the app. It's fine for it to come back null on a reading
--      passage or on a listening passage whose audio hasn't been generated
--      yet — the app treats a missing audio_path as "not ready to play",
--      never as an error.
-- ============================================================

alter table public.passages add column if not exists audio_path text;

create or replace function public.request_practice(p_type text, p_count int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid        uuid := auth.uid();
    v_tier       text;
    v_used       int;
    v_limit      int;
    v_remaining  int;
    v_serve      int;
    v_charge     int;
    v_passage_id text;
    v_questions  jsonb;
    v_passages   jsonb;
    v_metered    boolean;
begin
    if v_uid is null then
        raise exception 'auth_required';
    end if;

    if p_count < 1 or p_count > 20 then
        raise exception 'invalid_count';
    end if;

    select tier into v_tier from profiles where id = v_uid;

    -- Metered only when limits are on AND this user is not a member.
    v_metered := limits_enabled() and coalesce(v_tier, 'free') <> 'member';

    if v_metered then
        v_limit := free_daily_limit();

        insert into daily_usage (user_id, day, questions_served)
             values (v_uid, current_date, 0)
        on conflict (user_id, day) do nothing;

        select questions_served into v_used
          from daily_usage
         where user_id = v_uid and day = current_date
           for update;

        v_remaining := v_limit - coalesce(v_used, 0);
        if v_remaining <= 0 then
            raise exception 'daily_limit_reached';
        end if;
    end if;

    -- ---------------------------------------------------- reading / listening
    -- Both are one passage plus all of its questions, never split.
    if p_type in ('reading', 'listening') then
        select q.passage_id into v_passage_id
          from questions q
         where q.type = p_type and q.passage_id is not null
         group by q.passage_id
         order by (
             select count(*) from attempts a
              where a.user_id = v_uid
                and a.question_id in (
                    select id from questions where passage_id = q.passage_id
                )
         ) asc, random()
         limit 1;

        if v_passage_id is null then
            raise exception 'no_content';
        end if;

        select jsonb_agg(to_jsonb(x)) into v_questions from (
            select q.id, q.type, q.passage_id, q.prompt, q.options,
                   q.correct_index, q.explanation, q.difficulty
              from questions q
             where q.passage_id = v_passage_id
             order by q.id
        ) x;

        select jsonb_agg(to_jsonb(p)) into v_passages from (
            select id, topic, body, audio_path from passages where id = v_passage_id
        ) p;

    -- ---------------------------------------------------------- everything else
    else
        v_serve := case when v_metered then least(p_count, v_remaining) else p_count end;

        select jsonb_agg(to_jsonb(x)) into v_questions from (
            select q.id, q.type, q.passage_id, q.prompt, q.options,
                   q.correct_index, q.explanation, q.difficulty
              from questions q
             where q.type = p_type
             order by exists (
                 select 1 from attempts a
                  where a.user_id = v_uid and a.question_id = q.id
             ) asc, random()
             limit v_serve
        ) x;

        v_passages := '[]'::jsonb;
    end if;

    if v_questions is null or jsonb_array_length(v_questions) = 0 then
        raise exception 'no_content';
    end if;

    -- Record usage whether or not it is enforced, so the eventual limit can be
    -- set from observed behaviour rather than picked blind.
    v_charge := jsonb_array_length(v_questions);
    if v_charge > 0 then
        insert into daily_usage (user_id, day, questions_served)
             values (v_uid, current_date, v_charge)
        on conflict (user_id, day)
          do update set questions_served = daily_usage.questions_served + v_charge;
    end if;

    return jsonb_build_object(
        'questions', v_questions,
        'passages', coalesce(v_passages, '[]'::jsonb),
        'usage', usage_today()
    );
end;
$$;

create or replace function public.request_simulation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid       uuid := auth.uid();
    v_tier      text;
    v_questions jsonb;
    v_passages  jsonb;
begin
    if v_uid is null then
        raise exception 'auth_required';
    end if;

    select tier into v_tier from profiles where id = v_uid;
    if limits_enabled() and coalesce(v_tier, 'free') <> 'member' then
        raise exception 'members_only';
    end if;

    select jsonb_agg(to_jsonb(x)) into v_questions from (
        select q.id, q.type, q.passage_id, q.prompt, q.options,
               q.correct_index, q.explanation, q.difficulty
          from questions q
    ) x;

    select jsonb_agg(to_jsonb(p)) into v_passages from (
        select id, topic, body, audio_path from passages
    ) p;

    return jsonb_build_object(
        'questions', coalesce(v_questions, '[]'::jsonb),
        'passages', coalesce(v_passages, '[]'::jsonb)
    );
end;
$$;

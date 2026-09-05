-- ============================================================
-- Fix: free users were charged for questions they never received.
--
-- request_practice charged p_count up front, then ran a query with
-- `limit p_count`. When the bank held fewer questions of that type than were
-- asked for, the shortfall was still billed — a request for 10 restatements
-- against a bank holding 8 cost the user 10 of their 20 daily questions.
--
-- Two changes:
--   1. Charge what was actually returned, not what was asked for.
--   2. Never serve more than the remaining allowance, so a request can't
--      silently push a user past their limit.
--
-- Reading keeps its existing behaviour of going over rather than splitting a
-- passage — half a passage is useless, so it is served whole or not at all.
-- ============================================================

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
    v_is_member  boolean;
begin
    if v_uid is null then
        raise exception 'auth_required';
    end if;

    if p_count < 1 or p_count > 20 then
        raise exception 'invalid_count';
    end if;

    select tier into v_tier from profiles where id = v_uid;
    v_is_member := coalesce(v_tier, 'free') = 'member';

    -- Establish the allowance before doing any work.
    if not v_is_member then
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

    -- ---------------------------------------------------------- reading
    if p_type = 'reading' then
        select q.passage_id into v_passage_id
          from questions q
         where q.type = 'reading' and q.passage_id is not null
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
            select id, topic, body from passages where id = v_passage_id
        ) p;

        -- A passage is served whole even if it overruns the allowance;
        -- splitting it would leave the questions unanswerable.
        v_charge := jsonb_array_length(coalesce(v_questions, '[]'::jsonb));

    -- ---------------------------------------------------------- everything else
    else
        -- Never hand out more than is left, so a request cannot push the
        -- counter past the limit.
        v_serve := case when v_is_member then p_count
                        else least(p_count, v_remaining) end;

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

        -- Charge for what actually came back. A thin bank must not bill the
        -- user for questions that do not exist.
        v_charge := jsonb_array_length(coalesce(v_questions, '[]'::jsonb));
    end if;

    if v_questions is null or jsonb_array_length(v_questions) = 0 then
        raise exception 'no_content';
    end if;

    if not v_is_member and v_charge > 0 then
        update daily_usage
           set questions_served = questions_served + v_charge
         where user_id = v_uid and day = current_date;
    end if;

    return jsonb_build_object(
        'questions', v_questions,
        'passages', coalesce(v_passages, '[]'::jsonb),
        'usage', usage_today()
    );
end;
$$;

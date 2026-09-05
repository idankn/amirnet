-- ============================================================
-- Turn the daily limit off for now. Everyone gets unlimited practice and the
-- simulation, regardless of tier.
--
-- Done with a switch rather than by setting every profile to 'member'.
-- Flipping the tier column would work today, when nobody has paid, but it
-- destroys the only record of who actually is a member — so when limits come
-- back there would be no way to tell a paying user from someone who signed up
-- during the free period. The tier column stays truthful; this flag decides
-- whether it is enforced.
--
-- To re-enable limits later, one row:
--     update app_config set value = 'true'::jsonb where key = 'limits_enabled';
-- ============================================================

insert into public.app_config (key, value)
values ('limits_enabled', 'false'::jsonb)
on conflict (key) do update set value = excluded.value;


create or replace function public.limits_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (select (value #>> '{}')::boolean from app_config where key = 'limits_enabled'),
        true  -- Fail closed: a missing flag means limits apply.
    );
$$;


/**
 * How much of today's allowance is left.
 *
 * With limits off, every signed-in user reports as a member with a null limit,
 * so the app shows no quota anywhere — the same view a paying member gets.
 */
create or replace function public.usage_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_uid   uuid := auth.uid();
    v_tier  text;
    v_used  int;
begin
    if v_uid is null then
        return jsonb_build_object('signedIn', false);
    end if;

    if not limits_enabled() then
        return jsonb_build_object('signedIn', true, 'member', true, 'limit', null);
    end if;

    select tier into v_tier from profiles where id = v_uid;

    if v_tier = 'member' then
        return jsonb_build_object('signedIn', true, 'member', true, 'limit', null);
    end if;

    select coalesce(questions_served, 0) into v_used
      from daily_usage where user_id = v_uid and day = current_date;

    return jsonb_build_object(
        'signedIn', true,
        'member', false,
        'used', coalesce(v_used, 0),
        'limit', free_daily_limit()
    );
end;
$$;


/**
 * Hand out practice questions.
 *
 * Usage is still recorded while limits are off — the counting continues, only
 * the refusal stops. That way you can see what real demand looks like before
 * choosing a number, instead of guessing at one and finding out afterwards.
 */
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


/** A full timed sitting. Open to everyone while limits are off. */
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
        select id, topic, body from passages
    ) p;

    return jsonb_build_object(
        'questions', coalesce(v_questions, '[]'::jsonb),
        'passages', coalesce(v_passages, '[]'::jsonb)
    );
end;
$$;

grant execute on function public.limits_enabled() to anon, authenticated;

-- ============================================================
-- Move from "some content is locked" to "all content looks the same,
-- but free users get N questions a day".
--
-- The design problem this solves:
--
--   Quizlet can let the client read every set because their content is
--   user-generated and public — their moat is the study modes. Here the
--   question bank IS the product, so the client must never hold it. If the
--   app could read the `questions` table, a free user would fetch the whole
--   bank once and the daily limit would be decoration.
--
--   So direct reads are revoked entirely and questions are served one request
--   at a time by a function that counts usage first. The user sees no locks
--   anywhere; the limit only becomes visible when they reach it.
-- ============================================================

-- ------------------------------------------------------------
-- Stop serving content by direct table read.
-- ------------------------------------------------------------
drop policy if exists "free content is public" on public.questions;
drop policy if exists "members read all questions" on public.questions;
drop policy if exists "free passages are public" on public.passages;
drop policy if exists "members read all passages" on public.passages;

-- No SELECT policy now exists on either table, so with RLS on, neither anon
-- nor authenticated can read a single row directly. Everything goes through
-- the functions below.

-- ------------------------------------------------------------
-- USAGE
-- One row per user per day. Written only by the serving function.
-- ------------------------------------------------------------
create table public.daily_usage (
    user_id           uuid not null references auth.users (id) on delete cascade,
    day               date not null default current_date,
    questions_served  int  not null default 0,
    primary key (user_id, day)
);

alter table public.daily_usage enable row level security;

create policy "read own usage"
    on public.daily_usage for select
    to authenticated
    using (auth.uid() = user_id);

-- No insert/update policy: only the SECURITY DEFINER functions below write
-- here. A user who could increment their own counter could also reset it.

-- How many questions a free account gets per day. Kept in a table rather than
-- hard-coded so it can be tuned without shipping an app update.
create table public.app_config (
    key   text primary key,
    value jsonb not null
);

insert into public.app_config (key, value) values
    ('free_daily_questions', '20'::jsonb);

alter table public.app_config enable row level security;

create policy "config is readable"
    on public.app_config for select
    to anon, authenticated
    using (true);

-- ------------------------------------------------------------
-- SERVING
-- ------------------------------------------------------------

create function public.free_daily_limit()
returns int
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select (value #>> '{}')::int from app_config
                      where key = 'free_daily_questions'), 20);
$$;

/**
 * How much of today's allowance is left.
 *
 * Members report a null limit, meaning unlimited — the app shows them nothing
 * about quotas at all.
 */
create function public.usage_today()
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
 * Hand out practice questions, charging them against today's allowance.
 *
 * Raises `daily_limit_reached` when a free user is out. The app turns that
 * into the upgrade prompt — it is the only place the free/member distinction
 * becomes visible.
 *
 * Reading is special: a passage's questions only make sense together, so a
 * reading request returns one whole passage and charges for all of it.
 */
create function public.request_practice(p_type text, p_count int default 1)
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
    v_charge     int;
    v_passage_id text;
    v_questions  jsonb;
    v_passages   jsonb;
begin
    if v_uid is null then
        raise exception 'auth_required';
    end if;

    if p_count < 1 or p_count > 20 then
        raise exception 'invalid_count';
    end if;

    select tier into v_tier from profiles where id = v_uid;

    -- Reading is served a whole passage at a time.
    if p_type = 'reading' then
        select q.passage_id into v_passage_id
          from questions q
         where q.type = 'reading' and q.passage_id is not null
         group by q.passage_id
         -- Prefer a passage this user hasn't worked through.
         order by (
             select count(*) from attempts a
              where a.user_id = v_uid
                and a.question_id in (select id from questions where passage_id = q.passage_id)
         ) asc, random()
         limit 1;

        if v_passage_id is null then
            raise exception 'no_content';
        end if;

        select count(*) into v_charge from questions where passage_id = v_passage_id;
    else
        v_charge := p_count;
    end if;

    -- Charge the allowance before handing anything back. Members skip this
    -- entirely and are never counted.
    if coalesce(v_tier, 'free') <> 'member' then
        v_limit := free_daily_limit();

        insert into daily_usage (user_id, day, questions_served)
             values (v_uid, current_date, 0)
        on conflict (user_id, day) do nothing;

        select questions_served into v_used
          from daily_usage
         where user_id = v_uid and day = current_date
           for update;

        if v_used >= v_limit then
            raise exception 'daily_limit_reached';
        end if;

        -- Don't refuse a whole reading passage just because it would overrun
        -- the last few of the allowance — let it through and go over. Refusing
        -- would leave a free user permanently unable to open reading.
        update daily_usage
           set questions_served = questions_served + v_charge
         where user_id = v_uid and day = current_date;
    end if;

    if p_type = 'reading' then
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
    else
        select jsonb_agg(to_jsonb(x)) into v_questions from (
            select q.id, q.type, q.passage_id, q.prompt, q.options,
                   q.correct_index, q.explanation, q.difficulty
              from questions q
             where q.type = p_type
             -- Unseen questions first, then anything, shuffled within each group.
             order by exists (
                 select 1 from attempts a
                  where a.user_id = v_uid and a.question_id = q.id
             ) asc, random()
             limit p_count
        ) x;

        v_passages := '[]'::jsonb;
    end if;

    if v_questions is null then
        raise exception 'no_content';
    end if;

    return jsonb_build_object(
        'questions', v_questions,
        'passages', coalesce(v_passages, '[]'::jsonb),
        'usage', usage_today()
    );
end;
$$;

/**
 * A full timed sitting. Members only.
 *
 * The simulation is the differentiator — the thing no free competitor
 * reproduces — so it is what membership buys, rather than being metered.
 */
create function public.request_simulation()
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
    if coalesce(v_tier, 'free') <> 'member' then
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

-- Only signed-in users may call these. The functions themselves re-check
-- auth.uid(), so this is defence in depth rather than the actual control.
revoke execute on function public.request_practice(text, int) from anon;
revoke execute on function public.request_simulation() from anon;
grant execute on function public.request_practice(text, int) to authenticated;
grant execute on function public.request_simulation() to authenticated;
grant execute on function public.usage_today() to anon, authenticated;

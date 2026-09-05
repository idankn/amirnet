-- ============================================================
-- AMIRNET — Supabase schema
--
-- Two rules this file exists to enforce, both in the database rather than the
-- app, because the app is not a trust boundary:
--
--   1. Free vs member content is decided by row-level security. The client
--      never filters content itself — anyone holding the anon key can call
--      PostgREST directly, so a client-side check protects nothing. The
--      question bank is the product's core asset.
--
--   2. A user cannot promote themselves to 'member'. Row-level security alone
--      does not do column-level restriction, so UPDATE on profiles is granted
--      per-column and `tier` is deliberately excluded. Only the service role
--      (an IAP-validation webhook) may set it.
-- ============================================================

-- ------------------------------------------------------------
-- PROFILES
-- One row per auth user. Created automatically on signup.
-- ------------------------------------------------------------
create table public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    tier        text not null default 'free' check (tier in ('free', 'member')),
    -- The home screen's anchor. The user picks this; it is theirs to change.
    exam_date   date,
    created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
    on public.profiles for select
    to authenticated
    using (auth.uid() = id);

create policy "update own profile"
    on public.profiles for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- The whole point: authenticated users may write exam_date and nothing else.
-- Without this, the UPDATE policy above would let anyone set tier = 'member'.
revoke update on public.profiles from authenticated;
grant update (exam_date) on public.profiles to authenticated;

-- Give every new signup a profile, so the app never has to handle its absence.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id) values (new.id);
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- CONTENT
-- Mirrors the local bank (schema.sql), flattened for the app: options are
-- stored already-assembled rather than joined from a distractors table, since
-- the app only ever reads them as a set.
-- ------------------------------------------------------------
create table public.passages (
    id          text primary key,
    topic       text,
    body        text not null,
    -- Must match the is_free of its questions, or a free reading question
    -- arrives with no passage to read.
    is_free     boolean not null default false,
    created_at  timestamptz not null default now()
);

create table public.questions (
    id            text primary key,
    type          text not null,
    passage_id    text references public.passages (id) on delete cascade,
    prompt        text not null,
    options       jsonb not null,
    correct_index int not null,
    explanation   text,
    difficulty    int check (difficulty between 1 and 5),
    is_free       boolean not null default false,
    created_at    timestamptz not null default now()
);

create index questions_type_idx on public.questions (type);
create index questions_free_idx on public.questions (is_free);
create index questions_passage_idx on public.questions (passage_id);

alter table public.passages enable row level security;
alter table public.questions enable row level security;

-- The demo: readable by everyone, signed in or not.
create policy "free content is public"
    on public.questions for select
    to anon, authenticated
    using (is_free = true);

create policy "free passages are public"
    on public.passages for select
    to anon, authenticated
    using (is_free = true);

-- Everything else: members only, checked against the profile row the user
-- cannot edit.
create policy "members read all questions"
    on public.questions for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.tier = 'member'
        )
    );

create policy "members read all passages"
    on public.passages for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.tier = 'member'
        )
    );

-- Content is written by the pipeline via the service role only. No insert,
-- update or delete policy exists for anon or authenticated, so none is allowed.

-- ------------------------------------------------------------
-- ATTEMPTS
-- One row per answered question. This is what turns difficulty_est (a guess)
-- into difficulty_actual (real data), and it is why the backend exists at all.
-- ------------------------------------------------------------
create table public.attempts (
    id            bigserial primary key,
    user_id       uuid not null references auth.users (id) on delete cascade,
    question_id   text not null references public.questions (id) on delete cascade,
    chosen_index  int,
    is_correct    boolean not null,
    time_spent_ms int,
    created_at    timestamptz not null default now()
);

create index attempts_user_idx on public.attempts (user_id);
create index attempts_question_idx on public.attempts (question_id);

alter table public.attempts enable row level security;

create policy "insert own attempts"
    on public.attempts for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "read own attempts"
    on public.attempts for select
    to authenticated
    using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- REPORTS
-- The "something's wrong with this question" button. A question many users get
-- wrong AND report is likely broken, not hard.
-- ------------------------------------------------------------
create table public.reports (
    id          bigserial primary key,
    user_id     uuid references auth.users (id) on delete set null,
    question_id text not null references public.questions (id) on delete cascade,
    reason      text,
    created_at  timestamptz not null default now()
);

create index reports_question_idx on public.reports (question_id);

alter table public.reports enable row level security;

create policy "insert own reports"
    on public.reports for insert
    to authenticated
    with check (auth.uid() = user_id);

-- Reports are deliberately not readable by users — you review them with the
-- service role. A user reading others' reports learns nothing useful and
-- exposes which questions are known-broken.

-- ------------------------------------------------------------
-- QUESTION HEALTH
-- Real success rate per question, for spotting broken items. Service role
-- only: it is an authoring tool, not something the app reads.
-- ------------------------------------------------------------
create view public.question_health
with (security_invoker = true)
as
select
    q.id,
    q.type,
    q.difficulty,
    count(a.id)                                                as n_attempts,
    round(avg(case when a.is_correct then 1 else 0 end), 3)    as success_rate,
    (select count(*) from public.reports r where r.question_id = q.id) as n_reports
from public.questions q
left join public.attempts a on a.question_id = q.id
group by q.id;

-- ============================================================
-- AMIRNET question bank — SQLite schema
-- Ships with the iOS app; also used as the generation-side DB.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- PASSAGES
-- Reading-comprehension and listening items are a passage
-- with several questions hanging off it. Standalone question
-- types (sentence completion, restatement) leave passage_id NULL.
-- ------------------------------------------------------------
CREATE TABLE passages (
    id              INTEGER PRIMARY KEY,
    kind            TEXT NOT NULL CHECK (kind IN ('reading', 'listening')),
    topic           TEXT,                 -- science / economics / society / psychology / history
    body            TEXT NOT NULL,        -- the passage text (also the listening transcript)
    audio_path      TEXT,                 -- NULL for reading; file path/URL for listening
    word_count      INTEGER,
    difficulty_est  INTEGER CHECK (difficulty_est BETWEEN 1 AND 5),
    source          TEXT NOT NULL,        -- 'ai_generated' / 'original' / etc. — never a copied source
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','validated','rejected','live','retired')),
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- QUESTIONS
-- One row per answerable question. correct_answer is stored
-- inline; distractors live in their own table so restatement
-- questions can tag each distractor by the mistake it encodes.
-- ------------------------------------------------------------
CREATE TABLE questions (
    id              INTEGER PRIMARY KEY,
    type            TEXT NOT NULL CHECK (type IN (
                        'sentence_completion',
                        'restatement',
                        'reading',
                        'listening',
                        'vocab_in_context',
                        'word_formation')),
    passage_id      INTEGER REFERENCES passages(id) ON DELETE CASCADE,  -- NULL unless reading/listening
    prompt          TEXT NOT NULL,        -- the sentence / question stem
    correct_answer  TEXT NOT NULL,
    explanation     TEXT,                 -- shown after answering; the third screen
                                          -- in question -> answers -> explanation

    -- generation metadata
    target_word     TEXT,                 -- for completion / vocab / word_formation
    frequency_band  INTEGER,              -- which frequency tier the target word sits in
    source          TEXT NOT NULL,

    -- difficulty: estimated at generation, actual learned from users
    difficulty_est  INTEGER CHECK (difficulty_est BETWEEN 1 AND 5),
    difficulty_actual REAL,               -- recomputed from attempts once enough data exists

    -- validation trail
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','validated','rejected','live','retired')),
    validator_verdict TEXT,               -- second-model result: 'pass' / 'reject_multiple' / 'reject_lowconf'
    reject_reason   TEXT,                 -- free text when rejected

    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_questions_type   ON questions(type);
CREATE INDEX idx_questions_status ON questions(status);
CREATE INDEX idx_questions_pass   ON questions(passage_id);

-- ------------------------------------------------------------
-- DISTRACTORS
-- distractor_type is meaningful for restatement
-- (logic_flip / agent_swap / timing_shift) and NULL otherwise.
-- Tracking it lets you see which trap a user falls for.
-- ------------------------------------------------------------
CREATE TABLE distractors (
    id              INTEGER PRIMARY KEY,
    question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    distractor_type TEXT,                 -- logic_flip / agent_swap / timing_shift / NULL
    position        INTEGER               -- display order, if you want it fixed
);

CREATE INDEX idx_distractors_q ON distractors(question_id);

-- ------------------------------------------------------------
-- VOCAB
-- Separate shape from questions: a word list, not a multiple choice.
-- Definitions and example sentences are AI-generated (yours),
-- never lifted from a commercial dictionary.
-- ------------------------------------------------------------
CREATE TABLE vocab (
    id              INTEGER PRIMARY KEY,
    word            TEXT NOT NULL UNIQUE,
    definition_en   TEXT NOT NULL,
    example         TEXT,                 -- generated example sentence
    frequency_band  INTEGER,
    source          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','validated','rejected','live','retired')),
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- WRITING PROMPTS
-- The 12-minute experimental writing task. Feedback is generated
-- live per submission, so only the prompt is stored here.
-- ------------------------------------------------------------
CREATE TABLE writing_prompts (
    id              INTEGER PRIMARY KEY,
    prompt          TEXT NOT NULL,
    topic           TEXT,
    time_limit_sec  INTEGER NOT NULL DEFAULT 720,
    source          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','validated','rejected','live','retired')),
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- ATTEMPTS
-- One row per answered question. This is what turns
-- difficulty_est (a guess) into difficulty_actual (real data),
-- and later powers between-section adaptivity.
-- On device this can be local; sync to a backend if you want
-- cross-device calibration.
-- ------------------------------------------------------------
CREATE TABLE attempts (
    id              INTEGER PRIMARY KEY,
    question_id     INTEGER NOT NULL REFERENCES questions(id),
    user_id         TEXT,                 -- device id / account id
    chosen_answer   TEXT,
    is_correct      INTEGER NOT NULL CHECK (is_correct IN (0,1)),
    time_spent_ms   INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_attempts_q    ON attempts(question_id);
CREATE INDEX idx_attempts_user ON attempts(user_id);

-- ------------------------------------------------------------
-- REPORTS
-- The "something's wrong with this question" button.
-- A question many users get wrong AND report is likely broken,
-- not hard.
-- ------------------------------------------------------------
CREATE TABLE reports (
    id              INTEGER PRIMARY KEY,
    question_id     INTEGER NOT NULL REFERENCES questions(id),
    user_id         TEXT,
    reason          TEXT,                 -- 'two_correct' / 'typo' / 'unclear' / free text
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reports_q ON reports(question_id);

-- ------------------------------------------------------------
-- Handy view: live questions with their real success rate,
-- so you can spot broken items (very low success + reports).
-- ------------------------------------------------------------
CREATE VIEW question_health AS
SELECT
    q.id,
    q.type,
    q.difficulty_est,
    COUNT(a.id)                                   AS n_attempts,
    ROUND(AVG(a.is_correct), 3)                   AS success_rate,
    (SELECT COUNT(*) FROM reports r WHERE r.question_id = q.id) AS n_reports
FROM questions q
LEFT JOIN attempts a ON a.question_id = q.id
WHERE q.status = 'live'
GROUP BY q.id;

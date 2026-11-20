CREATE TABLE students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);

CREATE TABLE assignments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    title TEXT NOT NULL,
    fragment TEXT NOT NULL,
    homework_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (id, student_id)
);

CREATE INDEX assignments_by_student ON assignments(student_id, created_at DESC);

CREATE TABLE results (
    id TEXT NOT NULL,
    student_id TEXT NOT NULL REFERENCES students(id),
    assignment_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('hw', 'test')),
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    correct INTEGER NOT NULL,
    automatic INTEGER NOT NULL,
    pending INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (student_id, id),
    FOREIGN KEY (assignment_id, student_id) REFERENCES assignments(id, student_id)
);

CREATE INDEX results_by_student ON results(student_id, created_at DESC);
CREATE INDEX results_by_assignment ON results(assignment_id, student_id);

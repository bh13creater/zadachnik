import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../accounts-api/worker.mjs';
import impulse from '../assignments/impulse.json' with { type: 'json' };

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../accounts-api/migrations/0001_accounts.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const statement = db.prepare(sql);
    const bind = (...parameters) => ({
      first: () => statement.get(...parameters),
      all: () => ({ results: statement.all(...parameters) }),
      run: () => ({ meta: { changes: statement.run(...parameters).changes } }),
    });
    return { bind, all: bind().all };
  },
  batch: statements => statements.map(statement => statement.all()),
};
const hash = value => createHash('sha256').update(value).digest('hex');
const teacher = `t_${randomBytes(32).toString('base64url')}`;
const origin = 'https://test.invalid';
const env = { DB, SITE_ORIGIN: origin, TEACHER_KEY_SHA256: hash(teacher) };

async function request(path, key, { method = 'GET', data, expected = 200, requestOrigin = origin } = {}) {
  const headers = { Origin: requestOrigin, 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await worker.fetch(new Request(new URL(path, origin), {
    headers, method, body: data === undefined ? undefined : JSON.stringify(data),
  }), env);
  const body = await response.json().catch(() => null);
  assert.equal(response.status, expected, `${method} ${path} ${JSON.stringify(body)}`);
  return body;
}

await request('/students', teacher, { expected: 403, requestOrigin: 'https://other.invalid' });
await request('/students', null, { expected: 401 });
assert.equal((await request('/session', teacher)).role, 'teacher');
const add = name => request('/students', teacher, { method: 'POST', data: { name } });
const first = await add('Первый ученик');
const second = await add('Второй ученик');
const firstPath = `/students/${first.student.id}`;
assert.equal(db.prepare('SELECT key_hash FROM students WHERE id = ?').get(first.student.id).key_hash, hash(first.key));
assert.equal((await request('/session', first.key)).role, 'student');
await request(firstPath, second.key, { expected: 403 });
await request('/students', first.key, { method: 'POST', data: { name: 'Третий' }, expected: 403 });

const assignment = await request(`${firstPath}/assignments`, teacher, {
  method: 'POST', data: { title: 'Импульс', fragment: '#set=impulse' },
});
assert.equal((await request('/me', first.key)).assignments[0].id, assignment.id);
assert.deepEqual((await request('/me', second.key)).assignments, []);

const original = globalThis.OgeAssignments.encode('HW-', impulse);
const code = globalThis.OgeAssignments.encode('RES-', { k: 'hw', t: 'Импульс', f: hash(original), r: [['1', '5', 1]] });
const submission = { code, assignmentId: assignment.id, correct: 1, automatic: 1, pending: 0 };
const submit = (key, data, expected) => request('/me/results', key, { method: 'POST', data, expected });
await submit(second.key, submission, 404);
const wrong = globalThis.OgeAssignments.encode('RES-', { k: 'hw', f: hash('another work'), r: [['1', '5', 1]] });
await submit(first.key, { ...submission, code: wrong }, 400);
const result = await submit(first.key, submission);
assert.equal((await submit(first.key, submission)).id, result.id);
assert.equal((await request('/me', first.key)).results.length, 1);
assert.deepEqual((await request('/me', second.key)).results, []);
const resultPath = `${firstPath}/results/${result.id}`;
assert.equal((await request(resultPath, teacher)).code, code);
await request(resultPath, teacher, { method: 'PUT', data: { note: 'Проверь единицы.' } });
assert.equal((await request('/me', first.key)).results[0].note, 'Проверь единицы.');

const rotated = await request(`${firstPath}/key`, teacher, { method: 'POST' });
await request('/me', first.key, { expected: 401 });
assert.equal((await request('/me', rotated.key)).results[0].id, result.id);
console.log('PASS: role checks, student isolation, assignment validation, idempotent submission, teacher comments and key rotation.');

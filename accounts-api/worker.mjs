import '../learning-core.js';
import '../assignment-code.js';
import impulse from '../assignments/impulse.json' with { type: 'json' };
import dynamics from '../assignments/dynamics.json' with { type: 'json' };
import friction from '../assignments/friction.json' with { type: 'json' };
import ratio from '../assignments/ratio.json' with { type: 'json' };

const keyPattern = /^[ts]_[A-Za-z0-9_-]{43}$/;
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const resultIdPattern = /^[0-9a-f]{64}$/;
const fragmentPattern = /^#(?:set=(?:impulse|dynamics|friction|ratio)|hw=HW-[A-Za-z0-9_-]+)$/;
const presets = { impulse, dynamics, friction, ratio };
const maxBody = 1_250_000;
const encoder = new TextEncoder();

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function equalHash(left, right) {
  if (typeof right !== 'string' || right.length !== left.length) return false;
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return different === 0;
}

async function readBody(request, limit = maxBody) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Пустой запрос.');
  let buffer = '';
  let size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError(413, 'Запрос слишком большой.');
      }
      buffer += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(buffer + decoder.decode());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'Неверный формат запроса.');
  } finally {
    reader.releaseLock();
  }
}

function field(value, max, label, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
    throw new RequestError(400, `${label} должно содержать ${allowEmpty ? 'до' : 'от 1 до'} ${max} символов.`);
  }
  return value.trim();
}

function requireId(value, pattern = uuidPattern) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new RequestError(400, 'Неверный идентификатор.');
  return value;
}

function makeStudentKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return 's_' + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function authenticate(request, env) {
  const key = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!key || !keyPattern.test(key)) throw new RequestError(401, 'Введи действующий код доступа.');
  const hash = await digest(key);
  if (key.startsWith('t_') && equalHash(hash, env.TEACHER_KEY_SHA256)) return { role: 'teacher' };
  if (key.startsWith('s_')) {
    const student = await env.DB.prepare('SELECT id, name FROM students WHERE key_hash = ?').bind(hash).first();
    if (student) return { role: 'student', ...student, hash };
  }
  throw new RequestError(401, 'Код доступа не подошёл.');
}

async function dashboard(db, student) {
  const [assignments, results] = await db.batch([
    db.prepare('SELECT id, title, fragment, created_at FROM assignments WHERE student_id = ? ORDER BY created_at DESC LIMIT 100').bind(student.id),
    db.prepare(`SELECT id, assignment_id, kind, title, correct, automatic, pending, note, created_at
      FROM results WHERE student_id = ? ORDER BY created_at DESC LIMIT 100`).bind(student.id),
  ]);
  return { student: { id: student.id, name: student.name }, assignments: assignments.results, results: results.results };
}

async function saveResult(request, db, student) {
  const data = await readBody(request);
  const code = data.code;
  let work;
  try {
    if (typeof code !== 'string' || code.length > 1_100_000 || !/^RES-[A-Za-z0-9_-]+$/.test(code)) throw new Error();
    work = globalThis.OgeAssignments.result(code);
  } catch {
    throw new RequestError(400, 'Неверный код результата.');
  }
  const { correct, automatic, pending } = data;
  if (![correct, automatic, pending].every(value => Number.isInteger(value) && value >= 0) ||
      correct > automatic || automatic + pending > work.ids.length) throw new RequestError(400, 'Некорректные итоги работы.');

  const assignmentId = data.assignmentId === null ? null : requireId(data.assignmentId);
  if (assignmentId !== null) {
    const assignment = await db.prepare('SELECT homework_hash FROM assignments WHERE id = ? AND student_id = ?').bind(assignmentId, student.id).first();
    if (!assignment || work.kind !== 'hw') throw new RequestError(404, 'Домашняя работа не найдена.');
    if (work.homeworkHash !== assignment.homework_hash) throw new RequestError(400, 'Результат относится к другой домашней работе.');
  }

  const id = await digest(code);
  const inserted = await db.prepare(`INSERT INTO results
    (id, student_id, assignment_id, kind, title, code, correct, automatic, pending, created_at)
    SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ? FROM students WHERE id = ? AND key_hash = ?
    ON CONFLICT(student_id, id) DO NOTHING`).bind(
    id, assignmentId, work.kind, work.title, code, correct, automatic, pending, Date.now(), student.id, student.hash,
  ).run();
  if (!inserted.meta.changes) {
    const stillAuthorized = await db.prepare('SELECT 1 FROM students WHERE id = ? AND key_hash = ?').bind(student.id, student.hash).first();
    if (!stillAuthorized) throw new RequestError(401, 'Код доступа был заменён.');
  }
  return { id };
}

async function teacherRequest(request, db, path) {
  const method = request.method;
  if (path === '/students') {
    if (method === 'GET') {
      const { results } = await db.prepare('SELECT id, name FROM students ORDER BY name, id').all();
      return { students: results };
    }
    if (method === 'POST') {
      const name = field((await readBody(request, 1024)).name, 80, 'Имя');
      const id = crypto.randomUUID();
      const key = makeStudentKey();
      await db.prepare('INSERT INTO students VALUES (?, ?, ?, ?)').bind(id, name, await digest(key), Date.now()).run();
      return { student: { id, name }, key };
    }
  }
  const route = path.match(/^\/students\/([^/]+)(?:\/(key|assignments|results)(?:\/([^/]+))?)?$/);
  if (!route) throw new RequestError(404, 'Страница не найдена.');
  const [, rawStudentId, resource, rawResultId] = route;
  const studentId = requireId(rawStudentId);
  const student = await db.prepare('SELECT id, name FROM students WHERE id = ?').bind(studentId).first();
  if (!student) throw new RequestError(404, 'Ученик не найден.');
  if (!resource && method === 'GET') return dashboard(db, student);
  if (resource === 'key' && !rawResultId && method === 'POST') {
    const key = makeStudentKey();
    await db.prepare('UPDATE students SET key_hash = ? WHERE id = ?').bind(await digest(key), studentId).run();
    return { key };
  }
  if (resource === 'assignments' && !rawResultId && method === 'POST') {
    const data = await readBody(request);
    const title = field(data.title, 160, 'Название');
    const fragment = field(data.fragment, 300_000, 'Ссылка');
    if (!fragmentPattern.test(fragment)) throw new RequestError(400, 'Нужна ссылка задачника с #set= или #hw=.');
    const code = fragment.startsWith('#set=') ? globalThis.OgeAssignments.encode('HW-', presets[fragment.slice(5)]) : fragment.slice(4);
    try { globalThis.OgeAssignments.homework(code); }
    catch { throw new RequestError(400, 'Код домашней работы повреждён.'); }
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO assignments VALUES (?, ?, ?, ?, ?, ?)').bind(id, studentId, title, fragment, await digest(code), Date.now()).run();
    return { id };
  }
  if (resource === 'results' && rawResultId) {
    const id = requireId(rawResultId, resultIdPattern);
    if (method === 'GET') {
      const result = await db.prepare('SELECT code FROM results WHERE student_id = ? AND id = ?').bind(studentId, id).first();
      if (result) return result;
      throw new RequestError(404, 'Результат не найден.');
    }
    if (method === 'PUT') {
      const note = field((await readBody(request, 12_000)).note, 2000, 'Комментарий', true);
      const update = await db.prepare('UPDATE results SET note = ? WHERE student_id = ? AND id = ?').bind(note, studentId, id).run();
      if (!update.meta.changes) throw new RequestError(404, 'Результат не найден.');
      return { note };
    }
  }
  throw new RequestError(404, 'Страница не найдена.');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== env.SITE_ORIGIN) return new Response(null, { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...headers,
        'Access-Control-Allow-Methods': 'GET, POST, PUT', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
    }
    const json = (value, status = 200) => Response.json(value, { status, headers });
    try {
      const path = new URL(request.url).pathname;
      if (!env.DB || !resultIdPattern.test(env.TEACHER_KEY_SHA256 || '')) {
        throw new RequestError(503, 'Облачный кабинет ещё настраивается.');
      }
      const user = await authenticate(request, env);
      if (path === '/session' && request.method === 'GET') return json({ role: user.role, name: user.name });
      if (user.role === 'teacher') return json(await teacherRequest(request, env.DB, path));
      if (path === '/me' && request.method === 'GET') return json(await dashboard(env.DB, user));
      if (path === '/me/results' && request.method === 'POST') return json(await saveResult(request, env.DB, user));
      throw new RequestError(403, 'У этого аккаунта нет доступа.');
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      return json({ error: 'Облачный кабинет временно недоступен.' }, 500);
    }
  },
};

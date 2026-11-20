(() => {
  'use strict';
  const cloud = window.OgeCloud;
  const heading = document.querySelector('#heading');
  const workspace = document.querySelector('#workspace');
  const status = document.querySelector('#status');
  const loginPanel = document.querySelector('#sign-in');
  const loginForm = document.querySelector('#login');
  const signOut = document.querySelector('#sign-out');
  const date = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' });
  let view = 0;

  function element(tag, label, className) {
    const item = document.createElement(tag);
    if (label !== undefined) item.textContent = label;
    if (className) item.className = className;
    return item;
  }

  function control(tag, name, label, options = {}) {
    const wrapper = element('label', label);
    wrapper.append(Object.assign(element(tag), { name, ...options }));
    return wrapper;
  }

  function button(label, type = 'button', className) {
    return Object.assign(element('button', label, className), { type });
  }

  function panel(title) {
    const section = element('section', undefined, 'panel');
    section.append(element('h2', title));
    return section;
  }

  function notice(message) { status.textContent = message; }

  function loggedOut(message = '') {
    view++;
    cloud.logout();
    heading.textContent = 'Учебный кабинет';
    workspace.replaceChildren();
    signOut.hidden = true;
    loginPanel.hidden = false;
    loginForm.reset();
    notice(message);
  }

  function withAction(control, callback) {
    return async event => {
      const currentView = view;
      event?.preventDefault();
      control.disabled = true;
      try { await callback(); }
      catch (error) {
        if (currentView !== view) return;
        if (error.status === 401) loggedOut(error.message);
        else notice(error.message);
      } finally { control.disabled = false; }
    };
  }

  function assignmentList(items, results, clickable) {
    const section = panel('Выданные задания');
    if (!items.length) {
      section.append(element('p', 'Пока нет выданных заданий.'));
      return section;
    }
    const submitted = new Set(results.map(result => result.assignment_id));
    const list = element('ul');
    for (const item of items) {
      const row = element('li');
      if (clickable) {
        const link = element('a', item.title);
        const href = new URL('index.html', location.href);
        href.searchParams.set('assignment', item.id);
        href.hash = item.fragment;
        link.href = href.href;
        row.append(link);
      } else row.append(document.createTextNode(item.title));
      row.append(document.createTextNode(` · ${submitted.has(item.id) ? 'Сдано' : 'Выдано'} · ${date.format(item.created_at)}`));
      list.append(row);
    }
    section.append(list);
    return section;
  }

  function resultList(items, studentId) {
    const section = panel('Результаты');
    if (!items.length) section.append(element('p', 'Сохранённых работ пока нет.'));
    for (const item of items) {
      const row = element('article', undefined, 'record');
      row.append(element('h3', item.title));
      row.append(element('p', `${date.format(item.created_at)} · Автопроверка ${item.correct} из ${item.automatic} · На ручную проверку ${item.pending}`));
      if (item.note && !studentId) row.append(element('p', `Комментарий преподавателя — ${item.note}`));
      if (studentId) {
        const path = `students/${studentId}/results/${item.id}`;
        const details = element('details');
        const summary = element('summary', 'Код для проверки в кабинете репетитора');
        const code = control('textarea', 'result', 'Код результата', { readOnly: true, rows: 3 });
        details.append(summary);
        details.ontoggle = async () => {
          if (!details.open || code.isConnected) return;
          try {
            const result = await cloud.request(path);
            code.querySelector('textarea').value = result.code;
            details.append(code);
          } catch (error) { notice(error.message); }
        };
        const form = element('form');
        const save = button('Сохранить комментарий', 'submit');
        form.append(control('textarea', 'note', 'Комментарий ученику', { value: item.note, maxLength: 2000, rows: 2 }), save);
        form.onsubmit = withAction(save, async () => {
          await cloud.request(path, { method: 'PUT', data: { note: form.elements.note.value } });
          notice('Комментарий сохранён.');
        });
        row.append(details, form);
      }
      section.append(row);
    }
    return section;
  }

  function showIssuedKey(key, container) {
    const field = control('input', 'issuedKey', 'Передай этот код ученику лично', { readOnly: true, value: key, autocomplete: 'off' });
    const copy = button('Скопировать код');
    copy.onclick = withAction(copy, async () => {
      await navigator.clipboard.writeText(key);
      notice('Код скопирован.');
    });
    container.replaceChildren(field, copy);
    field.querySelector('input').select();
  }

  async function teacherPanel(ticket) {
    const { students } = await cloud.request('students');
    if (ticket !== view) return;
    const management = panel('Ученики');
    const createdKey = element('div', undefined, 'issued-key');
    const form = element('form');
    const create = button('Добавить ученика', 'submit', 'primary');
    form.append(control('input', 'name', 'Имя или псевдоним', { required: true, maxLength: 80 }), create);
    const selectLabel = control('select', 'student', 'Открыть журнал ученика');
    const select = selectLabel.querySelector('select');
    select.append(new Option('Выбрать ученика', ''));
    for (const student of students) select.append(new Option(student.name, student.id));
    const journal = element('div');
    management.append(form, createdKey, selectLabel);
    workspace.replaceChildren(management, journal);
    const materials = element('a', 'Открыть материалы преподавателя');
    materials.href = 'teach.html';
    workspace.append(materials);

    let selection = 0;
    async function openStudent() {
      const studentId = select.value;
      const active = ++selection;
      journal.replaceChildren();
      if (!studentId) return;
      const path = `students/${studentId}`;
      const data = await cloud.request(path);
      if (active !== selection || ticket !== view) return;
      const actions = panel(data.student.name);
      const assign = element('form');
      const submit = button('Выдать домашку', 'submit', 'primary');
      assign.append(
        control('input', 'title', 'Название домашней работы', { required: true, maxLength: 160 }),
        control('textarea', 'source', 'Ссылка на домашку из задачника', { required: true, rows: 2, maxLength: 301000 }),
        submit,
      );
      assign.onsubmit = withAction(submit, async () => {
        const raw = assign.elements.source.value.trim();
        let fragment;
        try { fragment = new URL(raw, location.href).hash; }
        catch { throw new Error('Вставь полную ссылку на домашку или её часть с #set= или #hw=.'); }
        await cloud.request(`${path}/assignments`, { method: 'POST', data: { title: assign.elements.title.value, fragment } });
        if (ticket !== view || active !== selection) return;
        await openStudent();
        notice('Домашка появилась в кабинете ученика.');
      });
      const rotate = button('Заменить код ученика');
      const rotatedKey = element('div', undefined, 'issued-key');
      rotate.onclick = withAction(rotate, async () => {
        if (!confirm('Старый код перестанет работать. Выдать новый код?')) return;
        const { key } = await cloud.request(`${path}/key`, { method: 'POST' });
        if (ticket === view && active === selection) showIssuedKey(key, rotatedKey);
      });
      actions.append(assign, rotate, rotatedKey);
      journal.replaceChildren(actions, assignmentList(data.assignments, data.results, false), resultList(data.results, studentId));
    }
    select.onchange = withAction(select, openStudent);
    form.onsubmit = withAction(create, async () => {
      const { student, key } = await cloud.request('students', { method: 'POST', data: { name: form.elements.name.value } });
      if (ticket !== view) return;
      form.reset();
      select.append(new Option(student.name, student.id));
      select.value = student.id;
      showIssuedKey(key, createdKey);
      await openStudent();
    });
  }

  async function show(user) {
    const ticket = ++view;
    loginPanel.hidden = true;
    signOut.hidden = false;
    heading.textContent = user.role === 'teacher' ? 'Журнал преподавателя' : 'Кабинет ученика';
    notice('Загружаем…');
    if (user.role === 'teacher') await teacherPanel(ticket);
    else {
      const data = await cloud.request('me');
      if (ticket !== view) return;
      heading.textContent = `Кабинет · ${data.student.name}`;
      workspace.replaceChildren(assignmentList(data.assignments, data.results, true), resultList(data.results));
    }
    if (ticket === view) notice('');
  }

  signOut.onclick = () => loggedOut();
  loginForm.onsubmit = withAction(loginForm.querySelector('button'), async () => {
    const user = await cloud.login(loginForm.elements.accessKey.value.trim());
    loginForm.reset();
    try { await show(user); }
    catch (error) { loggedOut(error.message); }
  });
  cloud.service().then(async endpoint => {
    if (!endpoint) return notice('Облачный кабинет ещё настраивается.');
    const user = cloud.session();
    if (user) await show(user);
    else loggedOut();
  }).catch(error => loggedOut(error.message));
})();

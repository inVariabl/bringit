// Local API & Real-time Configuration
const socket = io();

const MY_ID = Math.random().toString(36).substring(2, 9);
const REMOTE_CURSOR_COLORS = ['#00FFFF', '#FF00FF', '#FFFF00'];
const MY_COLOR = '#000000';

const state = {
  id: null,
  title: '',
  who: '',
  what: '',
  date: '',
  time: '',
  endTime: '',
  location: '',
  rows: [],
  saveTimer: null,
  lastUpdatedAt: null,
  presence: {},
};

// DOM Elements
const startCard = document.getElementById('start-card');
const listCard = document.getElementById('list-card');
const titleInput = document.getElementById('title-input');
const createPublicBtn = document.getElementById('create-public-btn');
const eyebrowEl = document.getElementById('eyebrow');
const heroTitle = document.getElementById('hero-title');
const heroTitleInput = document.getElementById('hero-title-input');
const whoLineInput = document.getElementById('who-line-input');
const dateLineInput = document.getElementById('date-line-input');
const timeLineInput = document.getElementById('time-line-input');
const endTimeLineInput = document.getElementById('end-time-line-input');
const whereLineInput = document.getElementById('where-line-input');
const exportCalendarBtn = document.getElementById('export-calendar-btn');
const rowsEl = document.getElementById('rows');
const addRowBtn = document.getElementById('add-row-btn');
const statusEl = document.getElementById('status');
const rowTemplate = document.getElementById('row-template');

function setStatus(text) { statusEl.textContent = text; }

function checkConfig() { return true; }

function isActivelyEditing() {
  const active = document.activeElement;
  return listCard.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement);
}

function getUrlListId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('list') || null;
}

function updateUrlListId(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('list', id);
  window.history.replaceState({}, '', url);
}

const heroEl = document.querySelector('.hero');
function updateSubtitle() {
  eyebrowEl.textContent = 'PUBLIC';
  document.title = state.title ? `${state.title} - Public` : 'BringIt';
}

function showListView() {
  startCard.classList.add('hidden');
  [listCard, heroEl, exportCalendarBtn].forEach(el => el.classList.remove('hidden'));
}

function showStartView() {
  startCard.classList.remove('hidden');
  [listCard, heroEl, exportCalendarBtn].forEach(el => el.classList.add('hidden'));
  titleInput.focus();
}

function createEmptyRow() { return { person: '', item: '', createdAt: new Date().toISOString() }; }
function isBlankRow(row) {
  return !String(row?.person || '').trim() && !String(row?.item || '').trim();
}

function normalizeRowsForState(rows) {
  return (Array.isArray(rows) ? rows : []).map((row, i) => ({
    person: String(row?.person || ''),
    item: String(row?.item || ''),
    createdAt: row?.createdAt || row?.created_at || new Date().toISOString(),
  }));
}

function getSelectionIndex(target) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return null;
  if (['date', 'time'].includes(target.type)) return null;
  return typeof target.selectionStart === 'number' ? target.selectionStart : null;
}

function buildPresencePayload(target) {
  if (!state.id || !target) return null;

  let row_index = null;
  let data_key = null;
  let focused_id = null;

  if (target.closest('#rows')) {
    row_index = parseInt(target.closest('tr').dataset.index, 10);
    data_key = target.dataset.key;
  } else if (target.id) {
    focused_id = target.id;
  }

  return {
    listId: state.id,
    user_id: MY_ID,
    color: MY_COLOR,
    focused_id,
    row_index,
    data_key,
    caret_pos: getSelectionIndex(target)
  };
}

function emitPresence(target = document.activeElement) {
  const payload = buildPresencePayload(target);
  if (payload) socket.emit('track_presence', payload);
}

function clearPresence() {
  if (!state.id) return;
  socket.emit('clear_presence', { listId: state.id, user_id: MY_ID });
}

function isTitleEditingVisible() {
  return !heroTitleInput.classList.contains('hidden');
}

function syncTitleEditingSurface() {
  const localEditingTitle = document.activeElement === heroTitleInput;
  const remoteEditingTitle = Object.values(state.presence || {}).some((presence) => (
    presence.user_id !== MY_ID && presence.focused_id === 'hero-title-input'
  ));
  const shouldShowInput = localEditingTitle || remoteEditingTitle;

  if (!localEditingTitle) heroTitleInput.value = state.title || '';
  heroTitleInput.classList.toggle('hidden', !shouldShowInput);
  heroTitle.classList.toggle('hidden', shouldShowInput);
}

function beginTitleEdit() {
  heroTitleInput.value = state.title || '';
  heroTitleInput.classList.remove('hidden');
  heroTitle.classList.add('hidden');
  heroTitleInput.focus();
  heroTitleInput.setSelectionRange(heroTitleInput.value.length, heroTitleInput.value.length);
  emitPresence(heroTitleInput);
}

function getCaretPagePosition(input, caretPos) {
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return null;
  if (typeof caretPos !== 'number') return null;
  if (['date', 'time'].includes(input.type)) return null;

  const style = window.getComputedStyle(input);
  const rect = input.getBoundingClientRect();
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const inputValue = input.value || '';
  const safeCaretPos = Math.max(0, Math.min(caretPos, inputValue.length));

  for (const prop of [
    'boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
    'lineHeight', 'fontFamily', 'letterSpacing', 'textTransform', 'textIndent', 'textAlign',
    'whiteSpace', 'wordSpacing'
  ]) {
    mirror.style[prop] = style[prop];
  }

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = input instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre';

  const beforeCaret = inputValue.slice(0, safeCaretPos).replace(/ /g, '\u00a0');
  mirror.textContent = beforeCaret || '\u00a0';
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const left = rect.left + window.scrollX + marker.offsetLeft;
  const top = rect.top + window.scrollY + ((rect.height - 20) / 2);
  mirror.remove();

  return { left, top };
}

function bindFieldSync(input, field, events = ['input']) {
  const handler = (e) => {
    broadcastInput(field, e.target.value);
    queueSave();
  };

  events.forEach((eventName) => {
    input.addEventListener(eventName, handler);
  });
}

function addRowAndFocus() {
  state.rows.push(createEmptyRow());
  renderRows();
  rowsEl.querySelector('tr:last-child input[data-key="item"]')?.focus();
  queueSave();
}

function renderRows() {
  const focusedIndex = Array.from(rowsEl.querySelectorAll('tr')).findIndex(tr => tr.contains(document.activeElement));
  const activeDataKey = document.activeElement?.dataset?.key;

  rowsEl.innerHTML = '';
  if (!state.rows.length) state.rows = [createEmptyRow()];
  state.rows.forEach((row, index) => {
    const clone = rowTemplate.content.cloneNode(true);
    const tr = clone.querySelector('tr');
    tr.dataset.index = index;
    const pIn = clone.querySelector('input[data-key="person"]');
    const iIn = clone.querySelector('input[data-key="item"]');
    pIn.value = row.person; iIn.value = row.item;
    
    pIn.addEventListener('input', (e) => { state.rows[index].person = e.target.value; broadcastInput('person', e.target.value, index); queueSave(); });
    iIn.addEventListener('input', (e) => { state.rows[index].item = e.target.value; broadcastInput('item', e.target.value, index); queueSave(); });
    pIn.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.shiftKey || index !== state.rows.length - 1) return;
      e.preventDefault();
      addRowAndFocus();
    });
    
    rowsEl.appendChild(clone);
  });

  if (focusedIndex !== -1 && activeDataKey) {
    const input = rowsEl.querySelector(`tr[data-index="${focusedIndex}"] input[data-key="${activeDataKey}"]`);
    input?.focus();
  }
}

async function createList() {
  const title = titleInput.value.trim() || 'HB BONFIRE';
  const id = Math.random().toString(36).substring(2, 10);
  const now = new Date().toISOString();

  const res = await fetch('/api/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id, title, visibility: 'public', created_at: now, updated_at: now,
      who: '', what: title, location: '', date: '', time: '', end_time: '', rows_json: []
    })
  });
  const data = await res.json();

  if (!res.ok) return setStatus(`Error: ${data.error}`);
  state.id = id; state.title = title;
  state.lastUpdatedAt = data.updated_at;
  updateUrlListId(id); subscribeToList(id);
  hydrateInputs(); showListView(); updateSubtitle(); setStatus('Created');
}

async function loadList(id) {
  const res = await fetch(`/api/lists/${id}`);
  const data = await res.json();
  if (!res.ok) return (showStartView(), setStatus('Not found'));

  state.id = data.id;
  state.title = data.title; state.who = data.who; state.date = data.date;
  state.time = data.time; state.endTime = data.end_time; state.location = data.location;
  const normalizedRows = normalizeRowsForState(data.rows_json);
  const persistedRows = normalizedRows.filter((row) => !isBlankRow(row));
  const removedBlankRows = persistedRows.length !== normalizedRows.length;

  state.rows = persistedRows;
  state.lastUpdatedAt = data.updated_at;
  subscribeToList(id);
  hydrateInputs(); showListView(); updateSubtitle(); setStatus('Loaded');
  if (removedBlankRows) queueSave();
}

async function saveList() {
  if (!state.id) return;
  setStatus('Saving...');
  const res = await fetch(`/api/lists/${state.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: state.title, who: whoLineInput.value, date: dateLineInput.value, time: timeLineInput.value,
      end_time: endTimeLineInput.value, location: whereLineInput.value,
      rows_json: state.rows, updated_at: new Date().toISOString()
    })
  });
  const data = await res.json();
  
  if (res.ok) { state.lastUpdatedAt = data.updated_at; setStatus('Saved'); }
}

function queueSave() { clearTimeout(state.saveTimer); state.saveTimer = setTimeout(saveList, 500); }

function subscribeToList(id) {
  socket.emit('join_list', id);
}

function broadcastInput(field, value, index = null) {
  if (!state.id) return;
  socket.emit('local_input', { listId: state.id, field, value, index });
}

socket.on('remote_input', (data) => {
  const active = document.activeElement;
  let target = null;
  if (data.index !== null) {
    if (!state.rows[data.index]) state.rows[data.index] = createEmptyRow();
    state.rows[data.index][data.field] = data.value;
    target = rowsEl.querySelector(`tr[data-index="${data.index}"] input[data-key="${data.field}"]`);
  } else {
    state[data.field] = data.value;
    const map = {
      who: whoLineInput, date: dateLineInput, time: timeLineInput,
      endTime: endTimeLineInput, location: whereLineInput, title: heroTitle
    };
    target = map[data.field];
  }
  
  // Only update if not the element WE are editing
  if (target && target !== active) {
    if (data.field === 'title') {
      heroTitle.textContent = data.value || 'HB BONFIRE';
      heroTitleInput.value = data.value || '';
    } else {
      target.value = data.value;
    }
  }

  syncTitleEditingSurface();
  if (state.presence) updateRemoteCursors(state.presence);
});

socket.on('list_updated', (remote) => {
  const remoteTime = new Date(remote.updated_at).getTime();
  const localTime = new Date(state.lastUpdatedAt).getTime();
  if (remoteTime <= localTime) return;
  
  const active = document.activeElement;
  const activeKey = active?.dataset?.key;
  const activeIndex = active?.closest('tr')?.dataset?.index;

  state.title = remote.title; state.who = remote.who; state.date = remote.date;
  state.time = remote.time; state.endTime = remote.end_time; state.location = remote.location;
  state.rows = normalizeRowsForState(remote.rows_json); state.lastUpdatedAt = remote.updated_at;
  
  // Update all inputs EXCEPT the one we are actively editing
  if (heroTitle !== active) heroTitle.textContent = state.title || 'HB BONFIRE';
  if (heroTitleInput !== active) heroTitleInput.value = state.title || '';
  if (whoLineInput !== active) whoLineInput.value = state.who || '';
  if (dateLineInput !== active) dateLineInput.value = state.date || '';
  if (timeLineInput !== active) timeLineInput.value = state.time || '';
  if (endTimeLineInput !== active) endTimeLineInput.value = state.endTime || '';
  if (whereLineInput !== active) whereLineInput.value = state.location || '';
  
  // For rows, we just re-render but the renderRows handles active element focus
  renderRows();
  if (state.presence) updateRemoteCursors(state.presence);
  updateSubtitle(); setStatus('Updated');
});

socket.on('presence_sync', (presenceState) => {
  state.presence = presenceState || {};
  syncTitleEditingSurface();
  updateRemoteCursors(presenceState);
});

function updateRemoteCursors(presenceState) {
  document.querySelectorAll('.remote-cursor').forEach(el => el.remove());

  Object.values(presenceState).forEach(presence => {
    if (presence.user_id === MY_ID) return;

    let targetEl = null;
    if (presence.row_index !== null && presence.data_key) {
      targetEl = rowsEl.querySelector(`tr[data-index="${presence.row_index}"] input[data-key="${presence.data_key}"]`);
    } else if (presence.focused_id) {
      targetEl = document.getElementById(presence.focused_id);
    }

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const caretPosition = getCaretPagePosition(targetEl, presence.caret_pos);
      const cursor = document.createElement('div');
      const remoteColor = REMOTE_CURSOR_COLORS[
        Array.from(String(presence.user_id || ''))
          .reduce((sum, char) => sum + char.charCodeAt(0), 0) % REMOTE_CURSOR_COLORS.length
      ];
      cursor.className = 'remote-cursor';
      cursor.style.setProperty('--cursor-color', presence.color === '#000000' ? remoteColor : (presence.color || remoteColor));
      cursor.style.left = `${caretPosition?.left ?? (rect.left + window.scrollX)}px`;
      cursor.style.top = `${caretPosition?.top ?? (rect.top + window.scrollY + 6)}px`;
      document.body.appendChild(cursor);
    }
  });
}

document.addEventListener('focusin', (e) => {
  emitPresence(e.target);
});

document.addEventListener('focusout', () => {
  window.setTimeout(() => {
    const active = document.activeElement;
    const isEditable = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    if (!state.id || (listCard.contains(active) && isEditable)) return;
    clearPresence();
  }, 0);
});

document.addEventListener('selectionchange', () => {
  const active = document.activeElement;
  if (!state.id || !listCard.contains(active)) return;
  emitPresence(active);
});

window.addEventListener('blur', clearPresence);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearPresence();
});

window.addEventListener('resize', () => {
  if (state.presence) updateRemoteCursors(state.presence);
});

window.addEventListener('scroll', () => {
  if (state.presence) updateRemoteCursors(state.presence);
}, { passive: true });

function hydrateInputs() {
  heroTitle.textContent = state.title || 'HB BONFIRE';
  heroTitleInput.value = state.title || '';
  whoLineInput.value = state.who || '';
  dateLineInput.value = state.date || '';
  timeLineInput.value = state.time || '';
  endTimeLineInput.value = state.endTime || '';
  whereLineInput.value = state.location || '';
  syncTitleEditingSurface();
  renderRows();
}

function downloadCalendarEvent() {
  const toISO = (d, t, h=0) => {
    if (!d || !t) return null;
    const [y, m, day] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number);
    const dt = new Date(Date.UTC(y, m-1, day, hh+h, mm, 0));
    const p = (n) => String(n).padStart(2, '0');
    return `${dt.getUTCFullYear()}${p(dt.getUTCMonth()+1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00`;
  };
  const start = toISO(state.date, state.time);
  if (!start) return setStatus('Set Date/Time');
  const end = state.endTime ? toISO(state.date, state.endTime) : toISO(state.date, state.time, 2);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BringIt//EN', 'BEGIN:VEVENT',
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${state.title}`, `LOCATION:${state.location}`,
    `DESCRIPTION:Who: ${state.who}\\nLink: ${window.location.href}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = 'event.ics'; link.click();
}

createPublicBtn.addEventListener('click', createList);
titleInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  createList();
});
addRowBtn.addEventListener('click', addRowAndFocus);
exportCalendarBtn.addEventListener('click', downloadCalendarEvent);
bindFieldSync(whoLineInput, 'who');
bindFieldSync(dateLineInput, 'date', ['input', 'change']);
bindFieldSync(timeLineInput, 'time', ['input', 'change']);
bindFieldSync(endTimeLineInput, 'endTime', ['input', 'change']);
bindFieldSync(whereLineInput, 'location');
heroTitle.addEventListener('click', beginTitleEdit);
heroTitle.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  beginTitleEdit();
});
heroTitleInput.addEventListener('input', (e) => {
  state.title = e.target.value;
  heroTitle.textContent = state.title || 'HB BONFIRE';
  updateSubtitle();
  broadcastInput('title', e.target.value);
});
heroTitleInput.addEventListener('blur', () => { state.title = heroTitleInput.value.trim() || 'HB BONFIRE'; hydrateInputs(); queueSave(); });

(async () => {
  if (!checkConfig()) return;
  const id = getUrlListId();
  if (id) await loadList(id); else showStartView();
})();

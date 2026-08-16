'use strict';

/* =========================================================================
   КОНСТАНТЫ И СОСТОЯНИЕ
   ========================================================================= */

const LS_KEYS = {
  stats: 'pb_stats_v2',
  theme: 'pb_theme',
  session: 'pb_session_v2',
  flags: 'pb_flags_v1',
  filters: 'pb_filters_v1',
  cloudUid: 'pb_cloud_uid',
};

const HISTORY_CAP = 20; // сколько последних попыток хранить на вопрос

let ALL_QUESTIONS = [];      // всё из data.json
let CATEGORIES = [];         // уникальные категории
let stats = loadJSON(LS_KEYS.stats, {});     // { [id]: { h:[1,0,...], streak, last } }
let flags = new Set(loadJSON(LS_KEYS.flags, []));
let selectedCategories = new Set(loadJSON(LS_KEYS.filters, null));
let session = loadJSON(LS_KEYS.session, null);

/* Firebase / облачная синхронизация */
const cloud = {
  enabled: false,
  auth: null,
  db: null,
  uid: null,
  unsub: null,
  writeTimer: null,
};

/* =========================================================================
   УТИЛИТЫ
   ========================================================================= */

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage save failed', e);
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

/* =========================================================================
   ЗАГРУЗКА ДАННЫХ
   ========================================================================= */

async function loadQuestions() {
  const res = await fetch('data.json');
  if (!res.ok) throw new Error('Не удалось загрузить data.json');
  ALL_QUESTIONS = await res.json();
  CATEGORIES = [...new Set(ALL_QUESTIONS.map(q => q.category).filter(Boolean))];
  if (!selectedCategories.size) {
    selectedCategories = new Set(CATEGORIES);
  }
}

/* =========================================================================
   СТАТИСТИКА
   ========================================================================= */

function recordAnswer(qid, isCorrect) {
  const key = String(qid);
  const rec = stats[key] || { h: [], streak: 0, last: 0 };
  rec.h.push(isCorrect ? 1 : 0);
  if (rec.h.length > HISTORY_CAP) rec.h.shift();
  rec.streak = isCorrect ? (rec.streak || 0) + 1 : 0;
  rec.last = Date.now();
  stats[key] = rec;
  saveJSON(LS_KEYS.stats, stats);
  scheduleCloudWrite();
}

function weaknessScore(qid) {
  const rec = stats[String(qid)];
  if (!rec || rec.h.length === 0) return 1000; // никогда не отвечали — высокий приоритет
  const wrongCount = rec.h.filter(x => !x).length;
  const accuracy = 1 - wrongCount / rec.h.length;
  const recentWrongBias = rec.h.slice(-3).filter(x => !x).length * 15;
  const daysSince = Math.min((Date.now() - (rec.last || 0)) / 86400000, 14);
  const flaggedBonus = flags.has(qid) ? 40 : 0;
  return (1 - accuracy) * 100 + recentWrongBias + daysSince + flaggedBonus;
}

function resetAllStats() {
  stats = {};
  flags = new Set();
  saveJSON(LS_KEYS.stats, stats);
  saveJSON(LS_KEYS.flags, []);
  scheduleCloudWrite();
  renderStats();
}

/* =========================================================================
   ФИЛЬТРЫ / КАТЕГОРИИ
   ========================================================================= */

function renderCategoryFilters() {
  const box = $('#category-filters');
  box.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = cat;
    btn.setAttribute('aria-pressed', selectedCategories.has(cat) ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (selectedCategories.has(cat)) {
        if (selectedCategories.size > 1) selectedCategories.delete(cat);
      } else {
        selectedCategories.add(cat);
      }
      saveJSON(LS_KEYS.filters, [...selectedCategories]);
      btn.setAttribute('aria-pressed', selectedCategories.has(cat) ? 'true' : 'false');
      updateTotalCount();
    });
    box.appendChild(btn);
  });
}

function getFilteredQuestions() {
  return ALL_QUESTIONS.filter(q => !q.category || selectedCategories.has(q.category));
}

function updateTotalCount() {
  $('#total-count').textContent = getFilteredQuestions().length;
}

/* =========================================================================
   ЗАПУСК СЕССИИ
   ========================================================================= */

function pickQuestionIds(mode, count) {
  const pool = getFilteredQuestions();
  let ordered;
  if (mode === 'order') {
    ordered = pool.slice().sort((a, b) => a.id - b.id);
  } else if (mode === 'random') {
    ordered = shuffle(pool);
  } else { // weak
    ordered = pool.slice().sort((a, b) => weaknessScore(b.id) - weaknessScore(a.id));
  }
  const n = count === 'all' ? ordered.length : Math.min(Number(count), ordered.length);
  return ordered.slice(0, n).map(q => q.id);
}

function startSession(mode) {
  const count = $('#question-count').value;
  const ids = pickQuestionIds(mode, count);
  if (!ids.length) {
    alert('Нет вопросов, подходящих под текущие фильтры.');
    return;
  }
  const optionOrders = {};
  ids.forEach(id => {
    const q = ALL_QUESTIONS.find(x => x.id === id);
    optionOrders[id] = shuffle(q.options.map((_, i) => i));
  });
  session = {
    mode,
    questionIds: ids,
    optionOrders,
    index: 0,
    answers: {}, // { [qid]: { selected:[idx...], checked:bool, correct:bool } }
  };
  saveJSON(LS_KEYS.session, session);
  showQuizScreen();
  renderQuestion();
}

/* =========================================================================
   РЕНДЕР ВОПРОСА
   ========================================================================= */

function currentQuestion() {
  const id = session.questionIds[session.index];
  return ALL_QUESTIONS.find(q => q.id === id);
}

function renderQuestion() {
  const q = currentQuestion();
  const order = session.optionOrders[q.id];
  const ans = session.answers[q.id] || { selected: [], checked: false, correct: false };
  session.answers[q.id] = ans;

  $('#current').textContent = session.index + 1;
  $('#total').textContent = session.questionIds.length;
  $('#progress-bar-fill').style.width = `${((session.index + 1) / session.questionIds.length) * 100}%`;

  $('#question-category').textContent = q.category || '';
  $('#question-text').textContent = q.question;
  $('#hint-multiple').hidden = q.type !== 'multiple';

  const src = $('#source-link');
  if (q.source) {
    src.href = q.source;
    src.hidden = false;
  } else {
    src.hidden = true;
  }

  const container = $('#options-container');
  container.innerHTML = '';
  const inputType = q.type === 'multiple' ? 'checkbox' : 'radio';

  order.forEach(origIdx => {
    const label = document.createElement('label');
    label.className = 'option-label';

    const input = document.createElement('input');
    input.type = inputType;
    input.name = 'option';
    input.value = String(origIdx);
    input.checked = ans.selected.includes(origIdx);
    input.disabled = ans.checked;
    input.addEventListener('change', () => onOptionChange(q, origIdx, inputType));

    const span = document.createElement('span');
    span.textContent = q.options[origIdx];

    label.appendChild(input);
    label.appendChild(span);
    container.appendChild(label);

    if (ans.checked) {
      if (q.correct.includes(origIdx)) label.classList.add('is-correct');
      else if (ans.selected.includes(origIdx)) label.classList.add('is-wrong');
    }
  });

  const feedback = $('#feedback');
  if (ans.checked) {
    feedback.hidden = false;
    const result = $('#feedback-result');
    result.textContent = ans.correct ? '✅ Верно' : '❌ Неверно';
    result.className = ans.correct ? 'ok' : 'fail';
    $('#explanation').textContent = q.explanation || '';
  } else {
    feedback.hidden = true;
  }

  $('#check-btn').hidden = ans.checked;
  $('#check-btn').disabled = ans.selected.length === 0;
  $('#prev-btn').disabled = session.index === 0;
  $('#next-btn').disabled = session.index === session.questionIds.length - 1;

  $('#flag-btn').textContent = flags.has(q.id) ? '🚩 Убрать из повтора' : '🚩 Отметить для повтора';

  saveJSON(LS_KEYS.session, session);
}

function onOptionChange(q, origIdx, inputType) {
  const ans = session.answers[q.id];
  if (ans.checked) return;
  if (inputType === 'radio') {
    ans.selected = [origIdx];
  } else {
    const i = ans.selected.indexOf(origIdx);
    if (i >= 0) ans.selected.splice(i, 1);
    else ans.selected.push(origIdx);
  }
  $('#check-btn').disabled = ans.selected.length === 0;
  saveJSON(LS_KEYS.session, session);
}

function checkAnswer() {
  const q = currentQuestion();
  const ans = session.answers[q.id];
  if (ans.checked || ans.selected.length === 0) return;
  const selectedSorted = ans.selected.slice().sort((a, b) => a - b);
  const correctSorted = q.correct.slice().sort((a, b) => a - b);
  const isCorrect = selectedSorted.length === correctSorted.length &&
    selectedSorted.every((v, i) => v === correctSorted[i]);
  ans.checked = true;
  ans.correct = isCorrect;
  recordAnswer(q.id, isCorrect);
  renderQuestion();
}

function goNext() {
  if (session.index < session.questionIds.length - 1) {
    session.index++;
    renderQuestion();
  }
}

function goPrev() {
  if (session.index > 0) {
    session.index--;
    renderQuestion();
  }
}

function toggleFlag() {
  const q = currentQuestion();
  if (flags.has(q.id)) flags.delete(q.id);
  else flags.add(q.id);
  saveJSON(LS_KEYS.flags, [...flags]);
  scheduleCloudWrite();
  renderQuestion();
}

/* =========================================================================
   СТАТИСТИКА (экран)
   ========================================================================= */

function renderStats() {
  const box = $('#stats-content');
  box.innerHTML = '';
  const rows = ALL_QUESTIONS.map(q => {
    const rec = stats[String(q.id)];
    return { q, rec };
  }).sort((a, b) => weaknessScore(b.q.id) - weaknessScore(a.q.id));

  rows.forEach(({ q, rec }) => {
    const row = document.createElement('div');
    row.className = 'stat-row';

    const label = document.createElement('span');
    const flagMark = flags.has(q.id) ? '🚩 ' : '';
    label.textContent = `${flagMark}№${q.id}. ${q.question.slice(0, 60)}${q.question.length > 60 ? '…' : ''}`;

    const squares = document.createElement('span');
    squares.className = 'stat-squares';
    const last5 = rec ? rec.h.slice(-5) : [];
    for (let i = 0; i < 5; i++) {
      const sq = document.createElement('span');
      sq.className = 'stat-square';
      if (i < last5.length) sq.classList.add(last5[i] ? 'correct' : 'wrong');
      squares.appendChild(sq);
    }

    row.appendChild(label);
    row.appendChild(squares);
    box.appendChild(row);
  });
}

/* =========================================================================
   ЭКРАНЫ
   ========================================================================= */

function showModeScreen() {
  $('#quiz-container').hidden = true;
  $('#mode-selection').hidden = false;
  updateTotalCount();
}

function showQuizScreen() {
  $('#mode-selection').hidden = true;
  $('#quiz-container').hidden = false;
}

/* =========================================================================
   ТЕМА
   ========================================================================= */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  saveJSON(LS_KEYS.theme, theme);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

/* =========================================================================
   ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ (Firebase, опционально)
   ========================================================================= */

function initCloud() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey) {
    $('#sync-btn').hidden = true;
    return; // синхронизация не настроена — работаем только локально
  }
  try {
    firebase.initializeApp(cfg);
    cloud.auth = firebase.auth();
    cloud.db = firebase.firestore();
    cloud.enabled = true;
  } catch (e) {
    console.warn('Firebase init failed', e);
    $('#sync-btn').hidden = true;
    return;
  }

  cloud.auth.onAuthStateChanged(user => {
    if (user) {
      cloud.uid = user.uid;
      saveJSON(LS_KEYS.cloudUid, user.uid);
      setSyncStatus('syncing', 'Синхронизация…');
      attachCloudListener();
      $('#sync-btn').textContent = '🔓 Отключить синхронизацию';
    } else {
      cloud.uid = null;
      if (cloud.unsub) { cloud.unsub(); cloud.unsub = null; }
      setSyncStatus('offline', 'Локально (это устройство)');
      $('#sync-btn').textContent = '🔗 Синхронизировать между устройствами';
    }
  });
}

function setSyncStatus(state, text) {
  const el = $('#sync-status');
  el.dataset.state = state;
  $('#sync-status-text').textContent = text;
}

async function attachCloudListener() {
  const ref = cloud.db.collection('users').doc(cloud.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const remote = snap.data();
    mergeRemoteIntoLocal(remote);
  }
  // выгружаем объединённый результат в облако (в т.ч. если документа ещё не было)
  await ref.set({
    stats,
    flags: [...flags],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  cloud.unsub = ref.onSnapshot(doc => {
    if (!doc.exists) return;
    if (doc.metadata.hasPendingWrites) return; // эхо собственной записи — игнорируем
    const remote = doc.data();
    mergeRemoteIntoLocal(remote, /*overwrite*/ true);
    setSyncStatus('online', 'Синхронизировано');
    renderStats();
    if (!$('#quiz-container').hidden) renderQuestion();
  });

  setSyncStatus('online', 'Синхронизировано');
}

function mergeRemoteIntoLocal(remote, overwrite = false) {
  if (remote.stats) {
    if (overwrite) {
      stats = remote.stats;
    } else {
      for (const [qid, rec] of Object.entries(remote.stats)) {
        const local = stats[qid];
        if (!local || (rec.last || 0) > (local.last || 0)) stats[qid] = rec;
      }
    }
    saveJSON(LS_KEYS.stats, stats);
  }
  if (remote.flags) {
    flags = overwrite ? new Set(remote.flags) : new Set([...flags, ...remote.flags]);
    saveJSON(LS_KEYS.flags, [...flags]);
  }
}

function scheduleCloudWrite() {
  if (!cloud.enabled || !cloud.uid) return;
  clearTimeout(cloud.writeTimer);
  cloud.writeTimer = setTimeout(async () => {
    try {
      await cloud.db.collection('users').doc(cloud.uid).set({
        stats,
        flags: [...flags],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('Cloud write failed', e);
    }
  }, 1200);
}

async function onSyncBtnClick() {
  if (!cloud.enabled) {
    alert('Синхронизация не настроена.\n\nЗаполните публичные ключи вашего Firebase-проекта в файле firebase-config.js — инструкция есть внутри файла.');
    return;
  }
  if (cloud.uid) {
    await cloud.auth.signOut();
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await cloud.auth.signInWithPopup(provider);
  } catch (e) {
    console.warn(e);
    alert('Не удалось войти: ' + (e.message || e));
  }
}

/* =========================================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================================= */

function bindEvents() {
  $all('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => startSession(btn.dataset.mode));
  });

  $('#check-btn').addEventListener('click', checkAnswer);
  $('#next-btn').addEventListener('click', goNext);
  $('#prev-btn').addEventListener('click', goPrev);
  $('#flag-btn').addEventListener('click', toggleFlag);
  $('#change-mode-btn').addEventListener('click', showModeScreen);

  $('#stats-toggle-btn').addEventListener('click', () => {
    const box = $('#stats-container');
    box.hidden = !box.hidden;
    if (!box.hidden) renderStats();
  });
  $('#stats-close-btn').addEventListener('click', () => { $('#stats-container').hidden = true; });
  $('#reset-stats-btn').addEventListener('click', () => {
    if (confirm('Точно сбросить всю статистику ответов на этом и на всех синхронизированных устройствах?')) {
      resetAllStats();
    }
  });

  $('#theme-toggle-btn').addEventListener('click', toggleTheme);
  $('#sync-btn').addEventListener('click', onSyncBtnClick);

  $('#question-count').addEventListener('change', updateTotalCount);

  // Клавиатурная навигация внутри вопроса
  document.addEventListener('keydown', e => {
    if ($('#quiz-container').hidden) return;
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
    if (e.key === 'Enter') checkAnswer();
  });
}

async function init() {
  applyTheme(loadJSON(LS_KEYS.theme, matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  await loadQuestions();
  renderCategoryFilters();
  updateTotalCount();
  bindEvents();
  initCloud();

  // Восстановление сессии, прерванной перезагрузкой страницы
  if (session && session.questionIds && session.questionIds.length) {
    const stillValid = session.questionIds.every(id => ALL_QUESTIONS.some(q => q.id === id));
    if (stillValid) {
      showQuizScreen();
      renderQuestion();
      return;
    }
  }
  showModeScreen();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

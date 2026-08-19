'use strict';

/* =========================================================================
   КОНСТАНТЫ И СОСТОЯНИЕ
   ========================================================================= */

const LS_KEYS = {
  stats: 'pb_stats_v3',
  theme: 'pb_theme',
  session: 'pb_session_v2',
  flags: 'pb_flags_v1',
  filters: 'pb_filters_v1',       // теперь хранит объект { [examArea]: [category,...] }
  cloudUid: 'pb_cloud_uid',
  statsSort: 'pb_stats_sort_v1',
  examArea: 'pb_exam_area_v1',
};

// Параметры формулы веса для режима «Наиболее забываемые»
const SCORE_ALPHA = 3;     // «наказание» за высокий score
const SCORE_BETA = 0.05;   // минимальный вес — чтобы даже выученные карточки изредка повторялись
const FLAG_WEIGHT_BOOST = 1.5; // дополнительный множитель веса для карточек, отмеченных флажком

let ALL_QUESTIONS = [];      // всё из data.json (все области аттестации сразу)
let EXAM_AREAS = [];         // уникальные области аттестации, напр. ["Б.9.4", "А.1"]
let CATEGORIES = [];         // уникальные категории ВНУТРИ текущей выбранной области
let stats = migrateAllStats(loadJSON(LS_KEYS.stats, {})); // { [id]: { total, correct, last5:[1,0,...], last } } — id глобально уникален, поэтому статистика областей не пересекается
let flags = new Set(loadJSON(LS_KEYS.flags, []));
let filtersByArea = loadJSON(LS_KEYS.filters, {});     // { [examArea]: [category, ...] }
let selectedCategories = new Set();                    // фильтр категорий для ТЕКУЩЕЙ области
let selectedExamArea = loadJSON(LS_KEYS.examArea, null);
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
  // Порядок областей — по первому появлению в файле (обычно соответствует порядку конвертации)
  EXAM_AREAS = [...new Set(ALL_QUESTIONS.map(q => q.examArea).filter(Boolean))];
}

/** Вопросы только выбранной области аттестации (без учёта фильтра по категориям). */
function getAreaQuestions() {
  return ALL_QUESTIONS.filter(q => q.examArea === selectedExamArea);
}

/** Пересчитывает список категорий (нормативных документов) для текущей области
 *  и восстанавливает/инициализирует фильтр выбранных категорий для неё. */
function refreshCategoriesForCurrentArea() {
  CATEGORIES = [...new Set(getAreaQuestions().map(q => q.category).filter(Boolean))];
  const saved = filtersByArea[selectedExamArea];
  if (saved && saved.length) {
    selectedCategories = new Set(saved.filter(c => CATEGORIES.includes(c)));
    if (!selectedCategories.size) selectedCategories = new Set(CATEGORIES);
  } else {
    selectedCategories = new Set(CATEGORIES);
  }
}

/* =========================================================================
   МОДЕЛЬ ДАННЫХ СТАТИСТИКИ
   ---------------------------------------------------------------------
   Новый формат записи на вопрос:
     { total: <всего попыток>, correct: <всего верных>,
       last5: [1,0,1,...] (максимум 5 последних исходов), last: <timestamp> }

   migrateAllStats() приводит записи старого формата ({h:[...], streak})
   к новому — это нужно, чтобы уже накопленная (в т.ч. синхронизированная
   через Firebase) статистика не терялась при обновлении приложения.
   ========================================================================= */

function migrateRecord(rec) {
  if (!rec) return rec;
  if (Array.isArray(rec.h)) {
    // старый формат: h — история попыток (до 20), streak — серия побед подряд
    return {
      total: rec.h.length,
      correct: rec.h.filter(x => x).length,
      last5: rec.h.slice(-5),
      last: rec.last || 0,
    };
  }
  return rec; // уже новый формат
}

function migrateAllStats(raw) {
  const out = {};
  for (const [qid, rec] of Object.entries(raw || {})) {
    out[qid] = migrateRecord(rec);
  }
  return out;
}

function getRec(qid) {
  return stats[String(qid)] || null;
}

function recordAnswer(qid, isCorrect) {
  const key = String(qid);
  const rec = stats[key] || { total: 0, correct: 0, last5: [], last: 0 };
  rec.total += 1;
  if (isCorrect) rec.correct += 1;
  rec.last5.push(isCorrect ? 1 : 0);
  if (rec.last5.length > 5) rec.last5.shift();
  rec.last = Date.now();
  stats[key] = rec;
  saveJSON(LS_KEYS.stats, stats);
  scheduleCloudWrite();
}

/**
 * Показатель выученности карточки, диапазон [0, 1].
 * Точная формула:
 *  - если total>=5 и последние 5 ответов верные -> score = 1 (выучено окончательно)
 *  - иначе score = 0.7*recent + 0.3*total_accuracy*trust
 *      recent = last5_correct / 5           (делим всегда на 5 — штраф за мало данных)
 *      total_accuracy = correct / total     (0, если попыток не было)
 *      trust = min(1, total / 10)           (доверие к общей точности насыщается к 10 попыткам)
 */
function computeScore(rec) {
  if (!rec || rec.total === 0) return 0;
  const last5Correct = rec.last5.reduce((a, b) => a + b, 0);
  if (rec.total >= 5 && rec.last5.length === 5 && last5Correct === 5) return 1;
  const recent = last5Correct / 5;
  const totalAccuracy = rec.total > 0 ? rec.correct / rec.total : 0;
  const trust = Math.min(1, rec.total / 10);
  return 0.7 * recent + 0.3 * totalAccuracy * trust;
}

/**
 * Вес карточки для вероятностной выборки в режиме «Наиболее забываемые».
 * weight = exp(-alpha * score) + beta, затем небольшой множитель для флажков.
 */
function computeWeight(qid) {
  const score = computeScore(getRec(qid));
  let w = Math.exp(-SCORE_ALPHA * score) + SCORE_BETA;
  if (flags.has(qid)) w *= FLAG_WEIGHT_BOOST;
  return w;
}

/**
 * Взвешенная выборка без возврата (алгоритм Ефраимидиса–Спиракиса):
 * каждому элементу присваивается случайный ключ random()^(1/weight),
 * сортировка по убыванию ключа даёт порядок, в котором элементы с большим
 * весом статистически чаще оказываются впереди — при этом весь список
 * остаётся псевдослучайным, а не жёстко детерминированным.
 */
function weightedOrder(items, weightFn) {
  return items
    .map(item => ({ item, key: Math.pow(Math.random(), 1 / weightFn(item)) }))
    .sort((a, b) => b.key - a.key)
    .map(x => x.item);
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
   ОБЩАЯ СТАТИСТИКА / СВОДКА
   ========================================================================= */

function computeSummary(pool) {
  let answered = 0, mastered = 0, totalAttempts = 0, correctAttempts = 0, scoreSum = 0, flaggedCount = 0;
  pool.forEach(q => {
    const rec = getRec(q.id);
    if (flags.has(q.id)) flaggedCount++;
    const score = computeScore(rec);
    scoreSum += score;
    if (score === 1) mastered++;
    if (rec && rec.total > 0) {
      answered++;
      totalAttempts += rec.total;
      correctAttempts += rec.correct;
    }
  });
  const total = pool.length;
  return {
    total,
    answered,
    mastered,
    masteredPct: total ? Math.round((100 * mastered) / total) : 0,
    progressPct: total ? Math.round((100 * scoreSum) / total) : 0,
    flaggedCount,
    accuracy: totalAttempts ? Math.round((100 * correctAttempts) / totalAttempts) : null,
  };
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
      filtersByArea[selectedExamArea] = [...selectedCategories];
      saveJSON(LS_KEYS.filters, filtersByArea);
      btn.setAttribute('aria-pressed', selectedCategories.has(cat) ? 'true' : 'false');
      updateTotalCount();
    });
    box.appendChild(btn);
  });
}

function getFilteredQuestions() {
  return getAreaQuestions().filter(q => !q.category || selectedCategories.has(q.category));
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
    ordered = pool.slice().sort((a, b) => a.num - b.num);
  } else if (mode === 'random') {
    ordered = shuffle(pool);
  } else { // weak — вероятностная выборка с приоритетом карточек с низким score
    ordered = weightedOrder(pool, q => computeWeight(q.id));
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
    examArea: selectedExamArea,
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

  $('#question-category').textContent = q.category ? `${q.category} · №${q.num}` : `№${q.num}`;
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

function getSortedStatRows(sortMode) {
  const pool = getFilteredQuestions();
  const rows = pool.map(q => ({ q, rec: getRec(q.id), score: computeScore(getRec(q.id)) }));
  switch (sortMode) {
    case 'weak_asc': // сначала самые лёгкие (высокий score)
      rows.sort((a, b) => b.score - a.score);
      break;
    case 'unanswered':
      rows.sort((a, b) => {
        const aAns = a.rec && a.rec.total ? 1 : 0;
        const bAns = b.rec && b.rec.total ? 1 : 0;
        if (aAns !== bAns) return aAns - bAns; // неотвеченные — вперёд
        return a.score - b.score;
      });
      break;
    case 'number':
      rows.sort((a, b) => a.q.num - b.q.num);
      break;
    case 'recent':
      rows.sort((a, b) => (a.rec?.last || 0) - (b.rec?.last || 0)); // давно/никогда — вперёд
      break;
    case 'weak_desc': // сначала самые сложные (низкий score)
    default:
      rows.sort((a, b) => a.score - b.score);
  }
  return rows;
}

function renderStatsSummary() {
  $('#stats-title').textContent = `Статистика · ${selectedExamArea || ''}`;
  const pool = getFilteredQuestions();
  const s = computeSummary(pool);
  const box = $('#stats-summary');
  box.innerHTML = '';
  const metrics = [
    { value: `${s.mastered} / ${s.total}`, sub: `${s.masteredPct}%`, label: 'Полностью выучено' },
    { value: `${s.progressPct}%`, label: 'Общий прогресс' },
    { value: `${s.answered}/${s.total}`, label: 'Отвечено вопросов' },
    { value: s.accuracy === null ? '—' : `${s.accuracy}%`, label: 'Точность ответов' },
    { value: String(s.flaggedCount), label: 'Помечено флажком' },
  ];
  metrics.forEach(m => {
    const div = document.createElement('div');
    div.className = 'stat-metric';
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = m.sub ? `${m.value} (${m.sub})` : m.value;
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = m.label;
    div.appendChild(value);
    div.appendChild(label);
    box.appendChild(div);
  });

  // Полоса общего прогресса (наглядное отражение progressPct)
  let bar = $('#stats-progress-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'stats-progress-bar';
    bar.className = 'stats-progress-track';
    bar.innerHTML = '<div class="stats-progress-fill"></div>';
    box.after(bar);
  }
  bar.querySelector('.stats-progress-fill').style.width = `${s.progressPct}%`;
}

function renderStats() {
  renderStatsSummary();

  const box = $('#stats-content');
  box.innerHTML = '';
  const sortMode = $('#stats-sort').value;
  const rows = getSortedStatRows(sortMode);

  rows.forEach(({ q, rec, score }) => {
    const row = document.createElement('div');
    row.className = 'stat-row';

    const label = document.createElement('span');
    label.className = 'stat-row-label';
    const flagMark = flags.has(q.id) ? '🚩 ' : '';
    label.textContent = `${flagMark}№${q.num}. ${q.question.slice(0, 60)}${q.question.length > 60 ? '…' : ''}`;

    const scoreEl = document.createElement('span');
    scoreEl.className = 'stat-score';
    scoreEl.textContent = `${Math.round(score * 100)}%`;

    const squares = document.createElement('span');
    squares.className = 'stat-squares';
    const last5 = rec ? rec.last5 : [];
    for (let i = 0; i < 5; i++) {
      const sq = document.createElement('span');
      sq.className = 'stat-square';
      if (i < last5.length) sq.classList.add(last5[i] ? 'correct' : 'wrong');
      squares.appendChild(sq);
    }

    row.appendChild(label);
    row.appendChild(scoreEl);
    row.appendChild(squares);
    box.appendChild(row);
  });
}

/* =========================================================================
   ЭКРАНЫ
   ========================================================================= */

function showAreaScreen() {
  $('#quiz-container').hidden = true;
  $('#mode-selection').hidden = true;
  $('#area-selection').hidden = false;
}

function showModeScreen() {
  $('#area-selection').hidden = true;
  $('#quiz-container').hidden = true;
  $('#mode-selection').hidden = false;
  $('#current-area-badge').textContent = selectedExamArea || '';
  updateTotalCount();
}

function showQuizScreen() {
  $('#area-selection').hidden = true;
  $('#mode-selection').hidden = true;
  $('#quiz-container').hidden = false;
}

/** Рендер кнопок выбора области аттестации на первом экране. */
function renderAreaButtons() {
  const box = $('#area-buttons');
  box.innerHTML = '';
  EXAM_AREAS.forEach(area => {
    const count = ALL_QUESTIONS.filter(q => q.examArea === area).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-btn area-btn';
    btn.innerHTML = `<span class="area-btn-title">${area}</span><span class="area-btn-count">${count} вопросов</span>`;
    btn.addEventListener('click', () => selectArea(area));
    box.appendChild(btn);
  });
}

function selectArea(area) {
  selectedExamArea = area;
  saveJSON(LS_KEYS.examArea, area);
  refreshCategoriesForCurrentArea();
  renderCategoryFilters();
  showModeScreen();
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
      $('#sync-btn').textContent = '🔓 Отключить';
    } else {
      cloud.uid = null;
      if (cloud.unsub) { cloud.unsub(); cloud.unsub = null; }
      setSyncStatus('offline', 'Локально');
      $('#sync-btn').textContent = '🔗 Синхронизировать';
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
    const remoteStats = migrateAllStats(remote.stats);
    if (overwrite) {
      stats = remoteStats;
    } else {
      for (const [qid, rec] of Object.entries(remoteStats)) {
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
  $all('#mode-buttons .mode-btn').forEach(btn => {
    btn.addEventListener('click', () => startSession(btn.dataset.mode));
  });

  $('#check-btn').addEventListener('click', checkAnswer);
  $('#next-btn').addEventListener('click', goNext);
  $('#prev-btn').addEventListener('click', goPrev);
  $('#flag-btn').addEventListener('click', toggleFlag);
  $('#change-mode-btn').addEventListener('click', showModeScreen);
  $('#change-area-btn').addEventListener('click', showAreaScreen);

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
  $('#stats-sort').addEventListener('change', () => {
    saveJSON(LS_KEYS.statsSort, $('#stats-sort').value);
    renderStats();
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
  renderAreaButtons();
  $('#stats-sort').value = loadJSON(LS_KEYS.statsSort, 'weak_desc');
  bindEvents();
  initCloud();

  // Восстановление сессии, прерванной перезагрузкой страницы (включая область аттестации)
  if (session && session.questionIds && session.questionIds.length && session.examArea) {
    const stillValid = session.questionIds.every(id => ALL_QUESTIONS.some(q => q.id === id));
    if (stillValid && EXAM_AREAS.includes(session.examArea)) {
      selectedExamArea = session.examArea;
      saveJSON(LS_KEYS.examArea, selectedExamArea);
      refreshCategoriesForCurrentArea();
      renderCategoryFilters();
      showQuizScreen();
      renderQuestion();
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
      return;
    }
  }

  // Если область уже выбиралась раньше — сразу открываем экран режима для неё,
  // иначе — экран выбора области (первый запуск).
  if (selectedExamArea && EXAM_AREAS.includes(selectedExamArea)) {
    refreshCategoriesForCurrentArea();
    renderCategoryFilters();
    showModeScreen();
  } else {
    showAreaScreen();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();

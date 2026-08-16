let questions = [];
let currentIndex = 0;
let answered = false;
let selectedAnswers = [];
let order = [];
let mode = 'order';
let stats = {};
let totalQuestionsCount = 20;

const modeSelection = document.getElementById('mode-selection');
const quizContainer = document.getElementById('quiz-container');
const totalCountSpan = document.getElementById('total-count');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const feedbackDiv = document.getElementById('feedback');
const explanationP = document.getElementById('explanation');
const sourceLink = document.getElementById('source-link');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const currentSpan = document.getElementById('current');
const totalSpan = document.getElementById('total');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const changeModeBtn = document.getElementById('change-mode-btn');
const hintMultiple = document.getElementById('hint-multiple');
const questionCountSelect = document.getElementById('question-count');
const statsToggleBtn = document.getElementById('stats-toggle-btn');
const statsContainer = document.getElementById('stats-container');
const statsContent = document.getElementById('stats-content');
const statsCloseBtn = document.getElementById('stats-close-btn');

// ---------------------------------------------------------------------
// Рекурсивный поиск массива в объекте
// ---------------------------------------------------------------------
function findArrayInObject(obj, path = 'root') {
    if (Array.isArray(obj)) {
        console.log(`🔍 Найден массив по пути: ${path}, длина: ${obj.length}`);
        if (obj.length > 0 && obj[0].id !== undefined && obj[0].question !== undefined) {
            console.log('✅ Массив похож на вопросы');
            return obj;
        }
        return obj;
    }
    if (obj && typeof obj === 'object') {
        for (const key in obj) {
            const result = findArrayInObject(obj[key], path + '.' + key);
            if (result) {
                return result;
            }
        }
    }
    return null;
}

// ---------------------------------------------------------------------
// Загрузка данных
// ---------------------------------------------------------------------
async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('HTTP error ' + response.status);
        const data = await response.json();
        console.log('📄 data.json загружен, тип:', typeof data);
        console.log('📄 Содержимое data.json (первые 100 символов):', JSON.stringify(data).slice(0, 100));

        const foundArray = findArrayInObject(data);
        if (foundArray && Array.isArray(foundArray) && foundArray.length > 0) {
            const first = foundArray[0];
            if (first && first.id !== undefined && first.question !== undefined) {
                questions = foundArray;
                console.log(`✅ Найден массив вопросов (${questions.length} шт.)`);
            } else {
                console.warn('⚠️ Найденный массив не похож на вопросы. Ищем дальше...');
                let nested = null;
                for (const item of foundArray) {
                    if (item && typeof item === 'object') {
                        const res = findArrayInObject(item);
                        if (res && Array.isArray(res) && res.length > 0 && res[0].id !== undefined) {
                            nested = res;
                            break;
                        }
                    }
                }
                if (nested) {
                    questions = nested;
                    console.log(`✅ Найден вложенный массив вопросов (${questions.length} шт.)`);
                } else {
                    console.warn('❌ Не удалось найти массив вопросов. Загружаем пример.');
                    questions = getExampleQuestions();
                }
            }
        } else {
            console.warn('❌ В data.json не найден массив. Загружаем пример.');
            questions = getExampleQuestions();
        }
    } catch (e) {
        console.warn('❌ Ошибка загрузки data.json, используем пример:', e);
        questions = getExampleQuestions();
    }

    if (!questions || questions.length === 0 || !questions[0] || questions[0].id === undefined) {
        console.warn('❌ Массив вопросов некорректен, загружаем пример.');
        questions = getExampleQuestions();
    }

    totalCountSpan.textContent = questions.length;
    console.log(`📚 Итоговое количество вопросов: ${questions.length}`);
    
    if (questions.length > 0) {
        console.log('📌 Первый вопрос:', questions[0].question.slice(0, 50) + '...');
        if (questions.length > 1) {
            console.log('📌 Второй вопрос:', questions[1].question.slice(0, 50) + '...');
        }
    }

    loadStats();
    modeSelection.style.display = 'flex';
    quizContainer.style.display = 'none';
}

// ---------------------------------------------------------------------
// Пример 20 вопросов (fallback) - полный список (здесь сокращён, в проекте полный)
// ---------------------------------------------------------------------
function getExampleQuestions() {
    // Возвращает 20 вопросов (полный список из предыдущих ответов)
    // Для краткости здесь не дублируем, но в реальном проекте он должен быть полным.
    return [ /* ... 20 вопросов ... */ ];
}

// ---------------------------------------------------------------------
// Работа со статистикой
// ---------------------------------------------------------------------
function loadStats() {
    const stored = localStorage.getItem('quizStats');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (typeof parsed === 'object' && parsed !== null) {
                stats = parsed;
                for (const q of questions) {
                    if (!stats[q.id]) {
                        stats[q.id] = { correct: 0, incorrect: 0, last5: [] };
                    } else if (!stats[q.id].last5) {
                        stats[q.id].last5 = [];
                    }
                }
                console.log(`📊 Загружена статистика для ${Object.keys(stats).length} вопросов`);
            } else {
                initStats();
            }
        } catch (e) {
            console.warn('Ошибка парсинга статистики, инициализируем заново', e);
            initStats();
        }
    } else {
        initStats();
    }
    saveStats();
}

function initStats() {
    stats = {};
    for (const q of questions) {
        stats[q.id] = { correct: 0, incorrect: 0, last5: [] };
    }
    console.log('📊 Инициализирована пустая статистика');
    saveStats();
}

function saveStats() {
    try {
        localStorage.setItem('quizStats', JSON.stringify(stats));
        console.log('💾 Статистика сохранена');
    } catch (e) {
        console.warn('Не удалось сохранить статистику:', e);
    }
}

function updateStats(questionId, correct) {
    if (!stats[questionId]) {
        stats[questionId] = { correct: 0, incorrect: 0, last5: [] };
    }
    const s = stats[questionId];
    if (correct) {
        s.correct++;
    } else {
        s.incorrect++;
    }
    s.last5.push(correct);
    if (s.last5.length > 5) {
        s.last5.shift();
    }
    saveStats();
}

function computeScoreAndWeight(q) {
    const s = stats[q.id];
    if (!s) {
        return { score: 0, weight: 1.05 };
    }
    const totalAttempts = s.correct + s.incorrect;
    const totalCorrect = s.correct;
    const last5 = s.last5 || [];
    const last5Correct = last5.filter(v => v === true).length;

    if (totalAttempts >= 5 && last5Correct === 5) {
        return { score: 1, weight: Math.exp(-3) + 0.05 };
    }

    const recent = last5Correct / 5;
    const totalAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
    const trust = Math.min(1, totalAttempts / 10);
    let score = 0.7 * recent + 0.3 * totalAccuracy * trust;
    score = Math.min(1, Math.max(0, score));
    const weight = Math.exp(-3 * score) + 0.05;
    return { score, weight };
}

function buildOrder(mode, count) {
    if (questions.length === 0) {
        console.warn('⚠️ buildOrder: questions пуст');
        return [];
    }

    let indices = Array.from({ length: questions.length }, (_, i) => i);

    if (mode === 'random') {
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return indices.slice(0, Math.min(count, indices.length));
    }

    if (mode === 'weak') {
        const weighted = indices.map(idx => {
            const q = questions[idx];
            const { weight } = computeScoreAndWeight(q);
            return { idx, weight };
        });
        weighted.sort((a, b) => b.weight - a.weight);
        const result = weighted.slice(0, Math.min(count, weighted.length)).map(item => item.idx);
        return result;
    }

    return indices.slice(0, Math.min(count, indices.length));
}

function startQuiz(selectedMode) {
    mode = selectedMode;
    totalQuestionsCount = parseInt(questionCountSelect.value, 10);
    order = buildOrder(mode, totalQuestionsCount);
    if (order.length === 0) {
        alert('Нет вопросов для отображения.');
        return;
    }
    currentIndex = 0;
    answered = false;
    selectedAnswers = [];
    modeSelection.style.display = 'none';
    quizContainer.style.display = 'block';
    totalSpan.textContent = order.length;
    updateNavButtons();
    renderQuestion();
}

function renderQuestion() {
    if (order.length === 0) return;
    const qIndex = order[currentIndex];
    const q = questions[qIndex];
    if (!q) return;

    answered = false;
    selectedAnswers = [];
    feedbackDiv.style.display = 'none';
    hintMultiple.style.display = 'none';

    currentSpan.textContent = currentIndex + 1;
    questionText.textContent = q.question;
    optionsContainer.innerHTML = '';

    const isMultiple = q.type === 'multiple';
    if (isMultiple) {
        hintMultiple.style.display = 'block';
    }

    if (q.source && q.source !== '') {
        sourceLink.href = q.source;
        sourceLink.style.display = 'inline-block';
    } else {
        sourceLink.style.display = 'none';
    }

    q.options.forEach((opt, idx) => {
        const label = document.createElement('label');
        label.className = 'option';
        const input = document.createElement('input');
        input.type = isMultiple ? 'checkbox' : 'radio';
        input.name = 'question';
        input.value = idx;
        if (isMultiple) {
            input.addEventListener('change', () => {
                if (input.checked) {
                    if (!selectedAnswers.includes(idx)) selectedAnswers.push(idx);
                } else {
                    selectedAnswers = selectedAnswers.filter(i => i !== idx);
                }
            });
        } else {
            input.addEventListener('change', () => {
                if (input.checked) checkSingle(idx);
            });
        }
        label.appendChild(input);
        label.appendChild(document.createTextNode(opt));
        optionsContainer.appendChild(label);
    });

    updateNavButtons();
}

// ---------------------------------------------------------------------
// Управление навигацией и завершением сессии
// ---------------------------------------------------------------------
function updateNavButtons() {
    const isLast = currentIndex === order.length - 1;
    if (isLast && answered) {
        // Если это последний вопрос и уже отвечено – показываем "Завершить"
        nextBtn.textContent = '🏁 Завершить';
        nextBtn.onclick = finishSession;
    } else if (isLast && !answered) {
        // Последний вопрос, но ещё не отвечено – показываем "Следующий" (неактивен до ответа)
        nextBtn.textContent = 'Следующий ▶';
        nextBtn.onclick = () => navigate(1);
    } else {
        nextBtn.textContent = 'Следующий ▶';
        nextBtn.onclick = () => navigate(1);
    }
    // Предыдущая кнопка всегда активна, если не первый вопрос
    prevBtn.disabled = (currentIndex === 0);
}

function finishSession() {
    // Возврат на стартовый экран
    quizContainer.style.display = 'none';
    modeSelection.style.display = 'flex';
    // Сброс состояния, чтобы при новом запуске всё было чисто
    order = [];
    currentIndex = 0;
    answered = false;
    selectedAnswers = [];
    // Возвращаем кнопке "Следующий" стандартное поведение
    nextBtn.textContent = 'Следующий ▶';
    nextBtn.onclick = () => navigate(1);
}

function navigate(delta) {
    const q = questions[order[currentIndex]];
    // Проверяем, что вопрос существует и что мы на множественном и не отвеченном
    if (q && q.type === 'multiple' && !answered) {
        if (selectedAnswers.length === 0) {
            alert('Пожалуйста, выберите хотя бы один вариант.');
            return;
        }
        checkMultiple();
        // После проверки переходим дальше только если не последний
        if (currentIndex === order.length - 1) {
            updateNavButtons(); // обновим кнопку на "Завершить"
        }
        // Если мы уже на последнем вопросе, не переходим, просто обновляем кнопку
        if (currentIndex === order.length - 1) return;
        // Если не последний, продолжаем переход
    }

    const newIdx = currentIndex + delta;
    if (newIdx < 0 || newIdx >= order.length) return;
    currentIndex = newIdx;
    renderQuestion();
}

// Переопределим checkMultiple, чтобы после проверки обновить навигацию
function checkMultiple() {
    if (answered) return;
    const qIndex = order[currentIndex];
    const q = questions[qIndex];
    const selected = selectedAnswers;
    const isCorrect = selected.length === q.correct.length && selected.every(i => q.correct.includes(i));
    updateStats(q.id, isCorrect);
    const options = document.querySelectorAll('.option');
    options.forEach((el, i) => {
        const inp = el.querySelector('input');
        inp.disabled = true;
        el.classList.add('disabled');
        if (q.correct.includes(i)) el.classList.add('correct');
        else if (selected.includes(i) && !q.correct.includes(i)) el.classList.add('incorrect');
    });
    answered = true;
    showFeedback(isCorrect);
    updateNavButtons(); // обновим кнопку (может стать "Завершить")
}

// Переопределим checkSingle аналогично
function checkSingle(idx) {
    if (answered) return;
    const qIndex = order[currentIndex];
    const q = questions[qIndex];
    const isCorrect = q.correct.includes(idx);
    updateStats(q.id, isCorrect);
    const options = document.querySelectorAll('.option');
    options.forEach((el, i) => {
        const inp = el.querySelector('input');
        inp.disabled = true;
        el.classList.add('disabled');
        if (q.correct.includes(i)) el.classList.add('correct');
        else if (i === idx && !isCorrect) el.classList.add('incorrect');
    });
    answered = true;
    showFeedback(isCorrect);
    updateNavButtons(); // обновим кнопку (может стать "Завершить")
}

function showFeedback(isCorrect) {
    const qIndex = order[currentIndex];
    const q = questions[qIndex];
    feedbackDiv.style.display = 'block';
    const correctStr = q.correct.map(i => i + 1).join(', ');
    const msg = isCorrect ? '✅ Верно!' : `❌ Неверно. Правильный ответ: вариант(ы) ${correctStr}`;
    explanationP.innerHTML = `<strong>${msg}</strong><br>${q.explanation}`;
}

function resetStats() {
    if (confirm('Сбросить всю статистику ответов?')) {
        stats = {};
        for (const q of questions) {
            stats[q.id] = { correct: 0, incorrect: 0, last5: [] };
        }
        saveStats();
        if (statsContainer.style.display !== 'none') {
            renderStats();
        }
        if (mode === 'weak') {
            order = buildOrder(mode, totalQuestionsCount);
            currentIndex = 0;
            renderQuestion();
        }
    }
}

// ---------------------------------------------------------------------
// Отображение статистики (показывает все вопросы)
// ---------------------------------------------------------------------
function renderStats() {
    if (questions.length === 0) {
        statsContent.innerHTML = '<p style="color: #6b7280;">Нет вопросов в базе.</p>';
        return;
    }
    let html = `<table>
        <thead>
            <tr>
                <th>№</th>
                <th>Вопрос</th>
                <th>✅</th>
                <th>❌</th>
                <th>Последние 5</th>
                <th>Score</th>
            </tr>
        </thead>
        <tbody>`;
    const sorted = [...questions].sort((a, b) => a.id - b.id);
    for (const q of sorted) {
        const data = stats[q.id] || { correct: 0, incorrect: 0, last5: [] };
        const last5 = data.last5 || [];
        let squaresHtml = '';
        for (let i = 0; i < 5; i++) {
            const val = i < last5.length ? last5[i] : null;
            let color = '#d1d5db';
            if (val === true) color = '#10b981';
            else if (val === false) color = '#ef4444';
            squaresHtml += `<span style="display:inline-block; width:14px; height:14px; border-radius:3px; background:${color}; margin:0 2px; border:1px solid rgba(0,0,0,0.1);"></span>`;
        }
        const { score } = computeScoreAndWeight(q);
        const scoreDisplay = score.toFixed(2);
        const shortQuestion = q.question.length > 50 ? q.question.slice(0, 50) + '…' : q.question;
        html += `<tr>
            <td>${q.id}</td>
            <td title="${q.question.replace(/"/g, '&quot;')}">${shortQuestion}</td>
            <td>${data.correct}</td>
            <td>${data.incorrect}</td>
            <td>${squaresHtml}</td>
            <td>${scoreDisplay}</td>
        </tr>`;
    }
    html += `</tbody></table>`;
    statsContent.innerHTML = html;
}

// ---------------------------------------------------------------------
// Обработчики событий
// ---------------------------------------------------------------------
statsToggleBtn.addEventListener('click', () => {
    if (statsContainer.style.display === 'none') {
        renderStats();
        statsContainer.style.display = 'block';
        statsToggleBtn.textContent = '📊 Скрыть статистику';
    } else {
        statsContainer.style.display = 'none';
        statsToggleBtn.textContent = '📊 Показать статистику';
    }
});
statsCloseBtn.addEventListener('click', () => {
    statsContainer.style.display = 'none';
    statsToggleBtn.textContent = '📊 Показать статистику';
});
resetStatsBtn.addEventListener('click', resetStats);

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        startQuiz(mode);
    });
});

prevBtn.addEventListener('click', () => navigate(-1));
// nextBtn обработчик устанавливается динамически в updateNavButtons

changeModeBtn.addEventListener('click', () => {
    quizContainer.style.display = 'none';
    modeSelection.style.display = 'flex';
    // Сброс состояния
    order = [];
    currentIndex = 0;
    answered = false;
    selectedAnswers = [];
    nextBtn.textContent = 'Следующий ▶';
    nextBtn.onclick = () => navigate(1);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') {
        // Используем текущую функцию кнопки next
        if (nextBtn.onclick) nextBtn.onclick();
    }
});

window.addEventListener('beforeunload', () => {
    saveStats();
});

// ---------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------
loadData();
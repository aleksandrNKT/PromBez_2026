let questions = [];
let currentIndex = 0;
let answered = false;
let selectedAnswers = [];

const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const feedbackDiv = document.getElementById('feedback');
const explanationP = document.getElementById('explanation');
const sourceLink = document.getElementById('source-link');
const checkBtn = document.getElementById('check-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const randomBtn = document.getElementById('random-btn');
const currentSpan = document.getElementById('current');
const totalSpan = document.getElementById('total');

async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('not found');
        questions = await response.json();
    } catch (_) {
        console.warn('data.json не найден, загружаем пример');
        questions = getExampleQuestions();
    }
    totalSpan.textContent = questions.length;
    renderQuestion();
}

function getExampleQuestions() {
    // Несколько примеров для демонстрации (полный набор генерируется скриптом convert.py)
    return [
        {
            id: 1,
            type: 'single',
            question: 'Какие из перечисленных обязанностей должно выполнять лицо, осуществляющее строительство здания или сооружения, в соответствии с законодательством о градостроительной деятельности?',
            options: [
                'Наблюдение за производством работ, своевременной доставкой строительных материалов и изделий.',
                'Наблюдение за производством работ и регистрация действий, противоречащих законодательству о градостроительной деятельности.',
                'Только контроль за качеством применяемых строительных материалов.',
                'Контроль за соответствием применяемых строительных материалов и изделий, в том числе строительных материалов, производимых на территории, на которой осуществляется строительство, требованиям проектной документации в течение всего процесса строительства.'
            ],
            correct: [3],
            explanation: '384-ФЗ, ст.34 ч.3: Лицо, осуществляющее строительство, должно осуществлять контроль за соответствием применяемых материалов требованиям проектной документации.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=0&size=5'
        },
        {
            id: 2,
            type: 'single',
            question: 'На основании требований какого документа осуществляется эксплуатация дымовых и вентиляционных промышленных труб?',
            options: [
                'Федерального закона от 30.12.2009 № 384-ФЗ «Технический регламент о безопасности зданий и сооружений».',
                'Правил технической эксплуатации тепловых энергоустановок.',
                'Правил техники безопасности при эксплуатации тепломеханического оборудования электростанций и тепловых сетей.'
            ],
            correct: [0],
            explanation: '384-ФЗ, ст.2 п.19, ст.36 ч.2 – промышленные дымовые трубы являются сооружениями, их эксплуатация регулируется указанным законом.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=0&size=5'
        },
        {
            id: 7,
            type: 'multiple',
            question: 'Какие перечисленные данные должны быть предусмотрены лицом, осуществляющим подготовку проектной документации, в проектной документации? (Выберите 2 варианта)',
            options: [
                'Необходимость проведения мониторинга действующей нормативной документации в области градостроительной деятельности.',
                'Минимальная периодичность осуществления проверок, осмотров и освидетельствований состояния строительных конструкций, основания, сетей инженерно-технического обеспечения и систем инженерно-технического обеспечения здания или сооружения.',
                'Прогноз изменения значений расчетных данных в процессе строительства и эксплуатации здания или сооружения.',
                'Необходимость проведения мониторинга компонентов окружающей среды, состояния основания, строительных конструкций и систем инженерно-технического обеспечения в процессе эксплуатации здания или сооружения.'
            ],
            correct: [1, 3],
            explanation: '384-ФЗ, ст.15 ч.9 п.2: должны быть предусмотрены минимальная периодичность проверок и/или необходимость мониторинга компонентов окружающей среды и состояния конструкций.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=1&size=5'
        },
        {
            id: 9,
            type: 'multiple',
            question: 'Какое из перечисленных лиц указывает такие идентификационные признаки зданий и сооружений, как назначение, принадлежность к опасным производственным объектам, пожарная и взрывопожарная опасность, уровень ответственности? (Выберите 2 варианта)',
            options: [
                'Застройщик (заказчик).',
                'Лицо, ответственное за эксплуатацию здания или сооружения.',
                'Лицо, осуществляющее подготовку проектной документации.',
                'Лицо, выполняющее инженерные изыскания.'
            ],
            correct: [0, 2],
            explanation: '384-ФЗ, ст.4 ч.11: идентификационные признаки указываются застройщиком (в задании) и лицом, осуществляющим подготовку проектной документации (в текстовых материалах).',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=1&size=5'
        }
    ];
}

function renderQuestion() {
    const q = questions[currentIndex];
    if (!q) return;
    currentSpan.textContent = currentIndex + 1;
    questionText.textContent = q.question;
    optionsContainer.innerHTML = '';
    feedbackDiv.style.display = 'none';
    checkBtn.style.display = 'none';
    answered = false;
    selectedAnswers = [];

    const isMultiple = q.type === 'multiple';
    if (isMultiple) {
        checkBtn.style.display = 'inline-block';
        checkBtn.onclick = checkMultiple;
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
}

function checkSingle(idx) {
    if (answered) return;
    const q = questions[currentIndex];
    const isCorrect = q.correct.includes(idx);
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
}

function checkMultiple() {
    if (answered) return;
    const q = questions[currentIndex];
    const options = document.querySelectorAll('.option');
    const selected = selectedAnswers;
    const isCorrect = selected.length === q.correct.length && selected.every(i => q.correct.includes(i));
    options.forEach((el, i) => {
        const inp = el.querySelector('input');
        inp.disabled = true;
        el.classList.add('disabled');
        if (q.correct.includes(i)) el.classList.add('correct');
        else if (selected.includes(i) && !q.correct.includes(i)) el.classList.add('incorrect');
    });
    answered = true;
    showFeedback(isCorrect);
}

function showFeedback(isCorrect) {
    const q = questions[currentIndex];
    feedbackDiv.style.display = 'block';
    const correctStr = q.correct.map(i => i + 1).join(', ');
    const msg = isCorrect ? '✅ Верно!' : `❌ Неверно. Правильный ответ: вариант(ы) ${correctStr}`;
    explanationP.innerHTML = `<strong>${msg}</strong><br>${q.explanation}`;
    sourceLink.href = q.source;
    sourceLink.textContent = '📎 Источник';
}

function navigate(delta) {
    const newIdx = currentIndex + delta;
    if (newIdx < 0 || newIdx >= questions.length) return;
    currentIndex = newIdx;
    renderQuestion();
}

function randomQuestion() {
    const newIdx = Math.floor(Math.random() * questions.length);
    currentIndex = newIdx;
    renderQuestion();
}

prevBtn.addEventListener('click', () => navigate(-1));
nextBtn.addEventListener('click', () => navigate(1));
randomBtn.addEventListener('click', randomQuestion);

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
});

loadData();
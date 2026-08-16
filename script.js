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
// Рекурсивный поиск массива в объекте с логированием
// ---------------------------------------------------------------------
function findArrayInObject(obj, path = 'root') {
    if (Array.isArray(obj)) {
        console.log(`🔍 Найден массив по пути: ${path}, длина: ${obj.length}`);
        // Проверяем, похож ли массив на вопросы (есть поля id, question и т.д.)
        if (obj.length > 0 && obj[0].id !== undefined && obj[0].question !== undefined) {
            console.log('✅ Массив похож на вопросы');
            return obj;
        }
        // Если массив не содержит id и question, но мы его нашли, попробуем найти внутри
        for (const item of obj) {
            if (item && typeof item === 'object') {
                const nested = findArrayInObject(item, path + '[]');
                if (nested) return nested;
            }
        }
        return null;
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
// Загрузка данных (усиленная)
// ---------------------------------------------------------------------
async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('HTTP error ' + response.status);
        const data = await response.json();
        console.log('📄 data.json загружен, тип:', typeof data);
        console.log('📄 Содержимое data.json (первые 100 символов):', JSON.stringify(data).slice(0, 100));

        // Ищем массив рекурсивно с логированием
        const foundArray = findArrayInObject(data);
        if (foundArray && Array.isArray(foundArray) && foundArray.length > 0) {
            // Проверяем, что это действительно массив вопросов (по структуре)
            const first = foundArray[0];
            if (first && first.id !== undefined && first.question !== undefined) {
                questions = foundArray;
                console.log(`✅ Найден массив вопросов (${questions.length} шт.)`);
            } else {
                console.warn('⚠️ Найденный массив не похож на вопросы. Загружаем пример.');
                questions = getExampleQuestions();
            }
        } else {
            console.warn('❌ В data.json не найден массив. Загружаем пример.');
            questions = getExampleQuestions();
        }
    } catch (e) {
        console.warn('❌ Ошибка загрузки data.json, используем пример:', e);
        questions = getExampleQuestions();
    }

    // Если questions всё ещё пуст или не содержит ожидаемых полей, используем пример
    if (!questions || questions.length === 0 || !questions[0] || questions[0].id === undefined) {
        console.warn('❌ Массив вопросов некорректен, загружаем пример.');
        questions = getExampleQuestions();
    }

    // Обновляем счётчик на стартовом экране
    totalCountSpan.textContent = questions.length;
    console.log(`📚 Итоговое количество вопросов: ${questions.length}`);

    // Инициализируем статистику
    loadStats();
    modeSelection.style.display = 'flex';
    quizContainer.style.display = 'none';
}

// ---------------------------------------------------------------------
// ПОЛНЫЙ список 20 вопросов (для fallback)
// ---------------------------------------------------------------------
function getExampleQuestions() {
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
            id: 3,
            type: 'single',
            question: 'На какой стадии должна осуществляться оценка соответствия зданий и сооружений, а также связанных со зданиями и сооружениями процессов проектирования (включая изыскания) в форме заявления о соответствии проектной документации требованиям Технического регламента о безопасности зданий и сооружений?',
            options: [
                'После утверждения проектной документации в соответствии с законодательством о градостроительной деятельности.',
                'Не регламентируется.',
                'До утверждения проектной документации в соответствии с законодательством о градостроительной деятельности.',
                'На усмотрение лица, подготовившего проектную документацию.'
            ],
            correct: [2],
            explanation: '384-ФЗ, ст.39 ч.6: Оценка соответствия осуществляется до утверждения проектной документации.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=0&size=5'
        },
        {
            id: 4,
            type: 'single',
            question: 'Кто должен осуществлять обязательную оценку соответствия зданий и сооружений, а также связанных со зданиями и сооружениями процессов строительства, монтажа, наладки в форме заявления о соответствии построенного, реконструированного или отремонтированного здания или сооружения проектной документации?',
            options: [
                'Лицо, подготовившее проектную документацию.',
                'Лицо, осуществившее строительство.',
                'Инспектор Ростехнадзора.',
                'Специальная комиссия, председателем которой является инспектор Ростехнадзора.'
            ],
            correct: [1],
            explanation: '384-ФЗ, ст.39 ч.4: Оценка соответствия осуществляется лицом, осуществившим строительство.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=0&size=5'
        },
        {
            id: 5,
            type: 'single',
            question: 'Какому перечисленному уровню ответственности соответствуют здания и сооружения, отнесенные к особо опасным, технически сложным или уникальным объектам в соответствии с Градостроительным кодексом Российской Федерации?',
            options: [
                'Пониженному.',
                'Экстремально высокому.',
                'Повышенному.',
                'Нормальному.'
            ],
            correct: [2],
            explanation: '384-ФЗ, ст.4 ч.8: К зданиям и сооружениям повышенного уровня ответственности относятся особо опасные, технически сложные или уникальные объекты.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=0&size=5'
        },
        {
            id: 6,
            type: 'single',
            question: 'Что из перечисленного принимается за предельное состояние строительных конструкций и основания по прочности и устойчивости?',
            options: [
                'Потеря устойчивости положения.',
                'Потеря устойчивости формы.',
                'Все перечисленное.',
                'Разрушение любого характера.'
            ],
            correct: [2],
            explanation: '384-ФЗ, ст.16 ч.2: За предельное состояние принимается разрушение, потеря устойчивости формы, потеря устойчивости положения, нарушение эксплуатационной пригодности.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=1&size=5'
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
            id: 8,
            type: 'single',
            question: 'Посредством проведения каких мероприятий должна обеспечиваться безопасность здания или сооружения в процессе эксплуатации?',
            options: [
                'Только посредством периодических осмотров строительных конструкций.',
                'Только посредством технического обслуживания систем инженерно-технического обеспечения.',
                'Посредством проведения всех перечисленных мероприятий, включая проведение текущих ремонтов здания или сооружения.',
                'Только посредством проведения экспертизы промышленной безопасности.',
                'Только посредством мониторинга состояния основания.'
            ],
            correct: [2],
            explanation: '384-ФЗ, ст.36 ч.1: Безопасность обеспечивается техническим обслуживанием, периодическими осмотрами, мониторингом, текущими ремонтами.',
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
        },
        {
            id: 10,
            type: 'single',
            question: 'В форме какого контроля осуществляется обязательная оценка соответствия зданий и сооружений, а также связанных со зданиями и с сооружениями процессов эксплуатации?',
            options: [
                'В форме государственного строительного надзора и государственного контроля.',
                'В форме производственного контроля.',
                'В форме эксплуатационного и государственного контроля (надзора).'
            ],
            correct: [2],
            explanation: '384-ФЗ, ст.40 ч.1: Оценка соответствия процессов эксплуатации осуществляется в форме эксплуатационного контроля и государственного контроля (надзора).',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=1&size=5'
        },
        {
            id: 11,
            type: 'single',
            question: 'Какое устанавливается минимальное значение коэффициента надежности по ответственности в отношении здания и сооружения повышенного уровня ответственности?',
            options: ['1,1', '1', '0,8', '1,3', '1,2'],
            correct: [0],
            explanation: '384-ФЗ, ст.16 ч.7 п.1: коэффициент надёжности по ответственности не ниже 1,1 для повышенного уровня.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=2&size=5'
        },
        {
            id: 12,
            type: 'multiple',
            question: 'Какое из перечисленных требований безопасности для пользователей зданиями и сооружениями должно соблюдаться? (Выберите 2 варианта ответа)',
            options: [
                'В пешеходных зонах зданий и сооружений высотой более 20 м должны быть предусмотрены защитные приспособления для обеспечения безопасности пребывания людей в этих зонах при действии ветра.',
                'Для обеспечения безопасности в аварийных ситуациях в проектной документации должна быть предусмотрена звуковая сигнализация.',
                'В проектной документации зданий и сооружений должны быть предусмотрены устройства для предупреждения случайного движения подвижных элементов оборудования здания или сооружения при отказе устройств автоматического торможения.',
                'Для обеспечения свободного перемещения людей должна быть предусмотрена достаточная ширина незаполняемых проемов в стенах.'
            ],
            correct: [2, 3],
            explanation: '384-ФЗ, ст.30 ч.5 п.1 и ч.3: должны быть предусмотрены устройства для предупреждения случайного движения подвижных элементов и достаточная ширина проемов.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=2&size=5'
        },
        {
            id: 13,
            type: 'single',
            question: 'Какие перечисленные здания и сооружения могут предусматривать необходимость научного сопровождения инженерных изысканий и (или) проектирования и строительства здания или сооружения?',
            options: [
                'Повышенного уровня ответственности.',
                'Экстремально высокого уровня ответственности.',
                'Нормального уровня ответственности.',
                'Все перечисленные.'
            ],
            correct: [0],
            explanation: '384-ФЗ, ст.15 ч.3: научное сопровождение предусматривается для зданий повышенного уровня ответственности.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=2&size=5'
        },
        {
            id: 14,
            type: 'single',
            question: 'Какой коэффициент запаса прочности по разрывной нагрузке должны иметь канатные стропы, используемые для подвеса люльки (кабины) на однорогий или двурогий крюк?',
            options: ['Не менее 5.', 'Не менее 8.', 'Не менее 10.', 'Не менее 6.'],
            correct: [2],
            explanation: 'ФНП №461, п.239: для канатных стропов коэффициент запаса не менее 10.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=2&size=5'
        },
        {
            id: 15,
            type: 'single',
            question: 'В каком положении должны проводиться статические испытания подъемников (вышек), кроме строительных?',
            options: [
                'В положении, приведенном в руководстве (инструкции) по эксплуатации, и с обязательной установкой аутригеров.',
                'В положении, отвечающем его наибольшей расчетной устойчивости.',
                'В положении, отвечающем его наименьшей расчетной устойчивости.',
                'В положении продольной оси стрелы, составляющей угол 45° с продольной осью подъемника.',
                'В положении продольной оси стрелы вдоль продольной оси подъемника.'
            ],
            correct: [2],
            explanation: 'ФНП №461, п.178: испытания проводятся в положении наименьшей расчётной устойчивости.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=2&size=5'
        },
        {
            id: 16,
            type: 'single',
            question: 'В каких перечисленных случаях допускается применять капиллярный неразрушающий контроль?',
            options: [
                'Применение капиллярного контроля сварных швов (кроме стыковых) устанавливается специализированной организацией в проекте ремонта, реконструкцию или модернизацию ПС.',
                'Применение капиллярного контроля устанавливается в проекте ремонта, реконструкцию или модернизацию ПС для любых типов сварных швов.',
                'Применение капиллярного контроля при ремонте, реконструкции или модернизации ПС для контроля качества сварных швов запрещается.',
                'Применение капиллярного контроля сварных швов предпочтительно, если неразрушающий контроль необходимо выполнить при отрицательных температурах окружающего воздуха.',
                'Применение капиллярного контроля сварных швов (кроме стыковых) возможно, если другие методы неразрушающего контроля применить невозможно или нецелесообразно.'
            ],
            correct: [0],
            explanation: 'ФНП №461, п.78: применение капиллярного контроля (кроме стыковых) устанавливается специализированной организацией в проекте ремонта.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=3&size=5'
        },
        {
            id: 17,
            type: 'single',
            question: 'Какие из перечисленных сведений не содержатся в проекте ремонта, реконструкции или модернизации подъемного сооружения с применением сварки?',
            options: [
                'Проектно-сметная документация на ремонтные работы.',
                'Способы контроля качества сварки.',
                'Нормы браковки сварных соединений.',
                'Указания о применяемых металлах и сварочных материалах.',
                'Порядок приемки из ремонта отдельных узлов и готовых изделий.'
            ],
            correct: [0],
            explanation: 'ФНП №461, п.93: проект ремонта должен содержать указания о материалах, способах контроля, нормах браковки, порядке приёмки – проектно-сметная документация не упоминается.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=3&size=5'
        },
        {
            id: 18,
            type: 'single',
            question: 'Что необходимо предпринять в случае невозможности восстановления информации долговременного хранения при ремонте регистратора параметров?',
            options: [
                'Должен быть составлен соответствующий Протокол и подписан специализированной и эксплуатирующей организациями.',
                'Специализированной организацией должна быть сделана соответствующая запись в паспорте ПС.',
                'Эксплуатирующей организацией должна быть проведена корректировка программного обеспечения.',
                'В этом случае регистратор параметров для дальнейшего применения не допускается.'
            ],
            correct: [1],
            explanation: 'ФНП №461, п.88: в случае невозможности восстановления информации делается запись в паспорте ПС.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=3&size=5'
        },
        {
            id: 19,
            type: 'single',
            question: 'К каким возможным последствиям не должен приводить любой отказ (поломка) любой составной части регистратора, ограничителя или указателя в процессе эксплуатации?',
            options: [
                'К невозможности опускания поднятого груза, если его масса выше паспортной грузоподъемности ПС.',
                'К любым возможным нарушениям режима нормальной эксплуатации ПС.',
                'К аварии ПС или инциденту на ПС.',
                'К случайным перегрузкам ПС.',
                'К аварии ПС, в том числе к падению ПС, его частей и/или груза.'
            ],
            correct: [1],
            explanation: 'ФНП №461, п.49: отказ не должен приводить к нарушениям нормальной эксплуатации.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=3&size=5'
        },
        {
            id: 20,
            type: 'single',
            question: 'Какие перечисленные требования предъявляются к стальным цепям, устанавливаемым на подъемных сооружениях (ПС)?',
            options: [
                'Стальные цепи должны соответствовать по марке и разрывному усилию указанным в паспорте ПС, иметь сертификат предприятия-изготовителя цепи.',
                'Стальные цепи должны иметь сертификат и иметь коэффициент запаса прочности не менее 3.',
                'Стальные цепи должны соответствовать по марке, диаметру и разрывному усилию указанным в паспорте ПС.',
                'Стальные цепи должны иметь сертификат и пройти испытание в соответствии с требованиями Правил устройства и безопасной эксплуатации грузоподъемных кранов.'
            ],
            correct: [0],
            explanation: 'ФНП №461, п.195: цепи должны быть сертифицированы и соответствовать по марке и разрывному усилию паспорту ПС.',
            source: 'https://prombez24.com/ticket/ordered/?testId=198&page=3&size=5'
        }
    ];
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

// ---------------------------------------------------------------------
// Расчёт выученности и веса
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Построение порядка карточек
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Управление викториной
// ---------------------------------------------------------------------
function startQuiz(selectedMode) {
    if (questions.length === 0) {
        alert('Вопросы не загружены. Пожалуйста, обновите страницу.');
        return;
    }
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
}

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
}

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
}

function showFeedback(isCorrect) {
    const qIndex = order[currentIndex];
    const q = questions[qIndex];
    feedbackDiv.style.display = 'block';
    const correctStr = q.correct.map(i => i + 1).join(', ');
    const msg = isCorrect ? '✅ Верно!' : `❌ Неверно. Правильный ответ: вариант(ы) ${correctStr}`;
    explanationP.innerHTML = `<strong>${msg}</strong><br>${q.explanation}`;
}

function navigate(delta) {
    const q = questions[order[currentIndex]];
    if (q && q.type === 'multiple' && !answered) {
        if (selectedAnswers.length === 0) {
            alert('Пожалуйста, выберите хотя бы один вариант.');
            return;
        }
        checkMultiple();
        return;
    }
    const newIdx = currentIndex + delta;
    if (newIdx < 0 || newIdx >= order.length) return;
    currentIndex = newIdx;
    renderQuestion();
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
// Отображение статистики (теперь показывает все вопросы из questions)
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
    // Сортируем по id
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
nextBtn.addEventListener('click', () => navigate(1));

changeModeBtn.addEventListener('click', () => {
    quizContainer.style.display = 'none';
    modeSelection.style.display = 'flex';
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
});

window.addEventListener('beforeunload', () => {
    saveStats();
});

// ---------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------
loadData();
# -*- coding: utf-8 -*-
"""
Конвертация одной или нескольких баз вопросов (Excel) в единый data.json
для тренажёра с поддержкой нескольких областей аттестации.

Использование:
    python3 convert.py <excel_1> <область_1> <excel_2> <область_2> ... [output.json]

Пример:
    python3 convert.py \
        testovaya_baza_198_s_otvetami.xlsx "Б.9.4" \
        testovaya_baza_A1_152_s_otvetami.xlsx "А.1" \
        data.json

Если только один файл — можно по-старому:
    python3 convert.py testovaya_baza_198_s_otvetami.xlsx data.json
    (тогда область аттестации определяется по имени файла или ставится "Б.9.4" по умолчанию)

Ключевое отличие от предыдущей версии: id вопроса теперь ГЛОБАЛЬНО уникален
и включает префикс области аттестации (например, "б94_1", "а1_1"), чтобы
базы разных областей аттестации можно было объединять в одном файле без
коллизий номеров и чтобы статистика по каждой области считалась независимо
(ключом остаётся просто id вопроса — он и так теперь уникален).

Метка "[!]" перед правильным вариантом ответа НЕ попадает в текст, который
видит пользователь — она используется только на этапе конвертации, чтобы
определить индексы правильных ответов, а затем вырезается из текста
варианта. Колонка «Правильный ответ» (если есть) используется только как
сверка (при расхождении выводится предупреждение, но берётся результат
по меткам "[!]").
"""

import pandas as pd
import json
import sys
import re
import unicodedata


def slugify_area(area: str) -> str:
    """Превращает 'Б.9.4' -> 'б94', 'А.1' -> 'а1' и т.п. для префикса id."""
    s = area.lower()
    s = s.replace('.', '')
    s = re.sub(r'[^0-9a-zа-яё]', '', s, flags=re.IGNORECASE)
    return s or 'обл'


def detect_category(norm_doc) -> str | None:
    if not norm_doc or (isinstance(norm_doc, float)):
        return None
    nd = str(norm_doc)
    patterns = [
        ('384-ФЗ', '384-ФЗ'),
        ('116-ФЗ', '116-ФЗ'),
        ('99-ФЗ', '99-ФЗ'),
        ('225-ФЗ', '225-ФЗ'),
        ('184-ФЗ', '184-ФЗ'),
        ('ТР ТС 010', 'ТР ТС 010/2011'),
        ('КоАП', 'КоАП РФ'),
        ('ГрК РФ', 'Градостроительный кодекс'),
        ('461', 'ФНП №461'),
        ('519', 'Приказ №519'),
        ('420', 'Приказ №420'),
        ('471', 'Приказ №471'),
        ('503', 'Приказ №503'),
        ('518', 'Приказ №518'),
        ('414', 'Приказ №414'),
        ('1437', 'ПП №1437'),
        ('1371', 'ПП №1371'),
        ('1241', 'ПП №1241'),
        ('1243', 'ПП №1243'),
        ('1477', 'ПП №1477'),
        ('1661', 'ПП №1661'),
        ('№13', 'ПП №13'),
        ('87', 'ПП №87'),
    ]
    for needle, label in patterns:
        if needle in nd:
            return label
    return None


def convert_one_excel(excel_file, exam_area, id_prefix, start_num=1):
    """Читает один xlsx и возвращает список вопросов с глобально уникальными id."""
    df = pd.read_excel(excel_file, sheet_name=0)
    questions = []
    warnings = []

    for _, row in df.iterrows():
        row_num = int(row['№ п/п'])
        q_type = str(row['Тип'])
        is_multiple = 'Множественный' in q_type
        question_text = str(row['Текст вопроса']).strip()

        options = []
        correct_indices = []
        for i in range(1, 7):
            opt = row.get(f'Вариант ответа {i}')
            if pd.notna(opt) and str(opt).strip():
                text = str(opt).strip()
                if text.startswith('[!]'):
                    correct_indices.append(len(options))
                    text = text[3:].strip()
                options.append(text)

        stated = row.get('Правильный ответ')
        if pd.notna(stated):
            stated_nums = sorted(int(n) - 1 for n in re.findall(r'\d+', str(stated)))
            if stated_nums != sorted(correct_indices):
                warnings.append(
                    f'[{exam_area}] Вопрос {row_num}: расхождение "[!]" {sorted(correct_indices)} '
                    f'vs колонки "Правильный ответ" {stated_nums}. Использую метки "[!]".'
                )

        explanation = ''
        norm_doc = row.get('Нормативный документ, пункт')
        text_point = row.get('Текст пункта нормативного документа')
        if pd.notna(norm_doc):
            explanation += str(norm_doc)
        if pd.notna(text_point):
            explanation += ': ' + str(text_point)

        source = row.get('Источник (страница)')
        source = '' if pd.isna(source) else str(source)

        questions.append({
            'id': f'{id_prefix}_{row_num}',
            'num': row_num,
            'examArea': exam_area,
            'type': 'multiple' if is_multiple else 'single',
            'question': question_text,
            'options': options,
            'correct': sorted(correct_indices),
            'explanation': explanation,
            'source': source,
            'category': detect_category(norm_doc if pd.notna(norm_doc) else None),
        })

    for q in questions:
        qid = q['id']
        if not q['correct']:
            warnings.append(f'[{exam_area}] {qid}: не найдено ни одного варианта с меткой "[!]"')
        for c in q['correct']:
            if c < 0 or c >= len(q['options']):
                warnings.append(f'[{exam_area}] {qid}: индекс правильного ответа {c} вне диапазона options')
        for opt in q['options']:
            if '[!]' in opt:
                warnings.append(f'[{exam_area}] {qid}: метка "[!]" осталась в тексте варианта!')
        if q['type'] == 'single' and len(q['correct']) != 1:
            warnings.append(f'[{exam_area}] {qid}: тип single, но правильных ответов {len(q["correct"])}')

    return questions, warnings


def main(argv):
    if len(argv) < 2:
        print('Usage: python convert.py <excel_1> <область_1> [<excel_2> <область_2> ...] [output.json]')
        print('   или: python convert.py <excel.xlsx> [output.json]   (одна область "Б.9.4" по умолчанию)')
        sys.exit(1)

    # Определяем, задан ли выходной файл последним аргументом (заканчивается на .json)
    output_file = 'data.json'
    args = list(argv[1:])
    if args and args[-1].lower().endswith('.json'):
        output_file = args.pop()

    pairs = []
    if len(args) == 1:
        # старый однофайловый режим — область по умолчанию
        pairs = [(args[0], 'Б.9.4')]
    else:
        if len(args) % 2 != 0:
            print('Ошибка: аргументы должны идти парами <excel> <область>.')
            sys.exit(1)
        for i in range(0, len(args), 2):
            pairs.append((args[i], args[i + 1]))

    all_questions = []
    all_warnings = []
    used_prefixes = {}

    for excel_file, exam_area in pairs:
        prefix = slugify_area(exam_area)
        if prefix in used_prefixes:
            prefix = f'{prefix}{used_prefixes[prefix]}'
            used_prefixes[prefix] = used_prefixes.get(prefix, 1) + 1
        else:
            used_prefixes[prefix] = 2
        qs, warns = convert_one_excel(excel_file, exam_area, prefix)
        print(f'✅ {exam_area}: {len(qs)} вопросов из {excel_file} (префикс id: "{prefix}")')
        all_questions.extend(qs)
        all_warnings.extend(warns)

    ids = [q['id'] for q in all_questions]
    if len(ids) != len(set(ids)):
        dupes = {i for i in ids if ids.count(i) > 1}
        all_warnings.append(f'Обнаружены повторяющиеся глобальные id: {sorted(dupes)}')

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    if all_warnings:
        print('⚠️  Предупреждения при конвертации:')
        for w in all_warnings:
            print('   -', w)

    areas_summary = ', '.join(f'{a} ({sum(1 for q in all_questions if q["examArea"]==a)})'
                               for a in dict.fromkeys(q['examArea'] for q in all_questions))
    print(f'✅ Итого сохранено в {output_file}: {len(all_questions)} вопросов. Области: {areas_summary}')


if __name__ == '__main__':
    main(sys.argv)

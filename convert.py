# -*- coding: utf-8 -*-
"""
Конвертация базы вопросов из Excel в data.json для тренажёра.

Главное отличие от предыдущей версии:
- Метка "[!]" перед правильным вариантом больше НЕ попадает в текст,
  который видит пользователь. Она используется только на этапе
  конвертации, чтобы определить индексы правильных ответов, а затем
  вырезается из текста варианта.
- Индексы правильных ответов вычисляются ИЗ МЕТКИ "[!]" — это
  единственный источник правды. Колонка "Правильный ответ" (если есть)
  используется только как сверка (при расхождении выводится
  предупреждение, но берётся результат по меткам "[!]").
- Добавлено поле "category" (384-ФЗ / ФНП №461 / Приказ №519 / ПП №87)
  для фильтрации вопросов по нормативному документу в интерфейсе.
- Добавлены проверки целостности данных (уникальность id, индексы
  в допустимых границах, отсутствие "утёкших" меток "[!]").
"""

import pandas as pd
import json
import sys
import re


def detect_category(norm_doc: str) -> str | None:
    if not norm_doc:
        return None
    nd = str(norm_doc)
    if '384-ФЗ' in nd:
        return '384-ФЗ'
    if '461' in nd:
        return 'ФНП №461'
    if '519' in nd:
        return 'Приказ №519'
    if '87' in nd:
        return 'ПП №87'
    return None


def convert_excel_to_json(excel_file, output_file):
    df = pd.read_excel(excel_file, sheet_name='База вопросов')
    questions = []
    warnings = []

    for _, row in df.iterrows():
        q_id = int(row['№ п/п'])
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

        # Сверка с колонкой "Правильный ответ" (не источник правды, только аудит)
        stated = row.get('Правильный ответ')
        if pd.notna(stated):
            stated_nums = sorted(int(n) - 1 for n in re.findall(r'\d+', str(stated)))
            if stated_nums != sorted(correct_indices):
                warnings.append(
                    f'Вопрос {q_id}: расхождение "[!]" {sorted(correct_indices)} '
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
            'id': q_id,
            'type': 'multiple' if is_multiple else 'single',
            'question': question_text,
            'options': options,
            'correct': sorted(correct_indices),
            'explanation': explanation,
            'source': source,
            'category': detect_category(norm_doc if pd.notna(norm_doc) else None),
        })

    # --- Проверки целостности ---
    ids = [q['id'] for q in questions]
    if len(ids) != len(set(ids)):
        dupes = {i for i in ids if ids.count(i) > 1}
        warnings.append(f'Обнаружены повторяющиеся id: {sorted(dupes)}')

    for q in questions:
        if not q['correct']:
            warnings.append(f'Вопрос {q["id"]}: не найдено ни одного варианта с меткой "[!]"')
        for c in q['correct']:
            if c < 0 or c >= len(q['options']):
                warnings.append(
                    f'Вопрос {q["id"]}: индекс правильного ответа {c} '
                    f'вне диапазона options (0..{len(q["options"]) - 1})'
                )
        for opt in q['options']:
            if '[!]' in opt:
                warnings.append(f'Вопрос {q["id"]}: метка "[!]" осталась в тексте варианта!')
        if q['type'] == 'single' and len(q['correct']) != 1:
            warnings.append(
                f'Вопрос {q["id"]}: тип "single", но правильных ответов {len(q["correct"])}'
            )

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    if warnings:
        print('⚠️  Предупреждения при конвертации:')
        for w in warnings:
            print('   -', w)
    print(f'✅ Конвертация завершена. {len(questions)} вопросов сохранено в {output_file}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python convert.py <excel_file> [output_json]')
        sys.exit(1)
    excel_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'data.json'
    convert_excel_to_json(excel_file, output_file)

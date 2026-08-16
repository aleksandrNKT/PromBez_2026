import pandas as pd
import json
import sys
import re

def convert_excel_to_json(excel_file, output_file):
    df = pd.read_excel(excel_file, sheet_name='База вопросов')
    questions = []
    for _, row in df.iterrows():
        q_id = int(row['№ п/п'])
        q_type = str(row['Тип'])
        is_multiple = 'Множественный' in q_type
        question_text = str(row['Текст вопроса'])

        options = []
        for i in range(1, 7):
            opt = row.get(f'Вариант ответа {i}')
            if pd.notna(opt) and str(opt).strip():
                options.append(str(opt).strip())

        correct_str = str(row['Правильный ответ'])
        numbers = re.findall(r'\d+', correct_str)
        correct_indices = [int(n) - 1 for n in numbers] if numbers else []

        explanation = ''
        norm_doc = row.get('Нормативный документ, пункт')
        text_point = row.get('Текст пункта нормативного документа')
        if pd.notna(norm_doc):
            explanation += str(norm_doc)
        if pd.notna(text_point):
            explanation += ': ' + str(text_point)

        source = row.get('Источник (страница)')
        if pd.isna(source):
            source = ''

        questions.append({
            'id': q_id,
            'type': 'multiple' if is_multiple else 'single',
            'question': question_text,
            'options': options,
            'correct': correct_indices,
            'explanation': explanation,
            'source': str(source)
        })

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python convert.py <excel_file> [output_json]')
        sys.exit(1)
    excel_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'data.json'
    convert_excel_to_json(excel_file, output_file)
    print(f'✅ Конвертация завершена. Файл сохранён как {output_file}')
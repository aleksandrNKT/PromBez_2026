# -*- coding: utf-8 -*-
"""
Проверка целостности data.json перед коммитом / в CI.
Запуск: python validate_data.py [data.json]
Возвращает код выхода 1, если найдены ошибки.
"""
import json
import sys


def validate(path='data.json'):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    errors = []
    ids_seen = set()

    if not isinstance(data, list) or not data:
        errors.append('Файл должен содержать непустой список вопросов.')
        return errors

    for q in data:
        qid = q.get('id', '???')

        if 'id' not in q or not isinstance(q['id'], int):
            errors.append(f'Вопрос {qid}: отсутствует или некорректен id.')
        elif q['id'] in ids_seen:
            errors.append(f'Вопрос {qid}: дублирующийся id.')
        else:
            ids_seen.add(q['id'])

        if q.get('type') not in ('single', 'multiple'):
            errors.append(f'Вопрос {qid}: некорректный type "{q.get("type")}".')

        options = q.get('options', [])
        if not options or len(options) < 2:
            errors.append(f'Вопрос {qid}: меньше 2 вариантов ответа.')

        for opt in options:
            if '[!]' in opt:
                errors.append(f'Вопрос {qid}: метка "[!]" осталась в тексте варианта.')

        correct = q.get('correct', [])
        if not correct:
            errors.append(f'Вопрос {qid}: нет ни одного правильного ответа.')
        for c in correct:
            if not isinstance(c, int) or c < 0 or c >= len(options):
                errors.append(f'Вопрос {qid}: индекс правильного ответа {c} вне диапазона.')

        if q.get('type') == 'single' and len(correct) != 1:
            errors.append(f'Вопрос {qid}: тип single, но правильных ответов {len(correct)}.')

        if not q.get('question', '').strip():
            errors.append(f'Вопрос {qid}: пустой текст вопроса.')

    return errors


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'data.json'
    errors = validate(path)
    if errors:
        print(f'❌ Найдено ошибок: {len(errors)}')
        for e in errors:
            print('   -', e)
        sys.exit(1)
    print('✅ data.json прошёл проверку целостности.')

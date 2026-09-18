// Конфигурация Firebase для облачной синхронизации статистики между устройствами.
//
// Это НЕ секретные ключи — веб-конфигурация Firebase предназначена для
// публикации в клиентском коде (безопасность обеспечивается правилами
// доступа Firestore, а не секретностью этого файла). Смело коммитьте
// его в репозиторий после заполнения своими значениями.
//
// Как получить:
// 1. https://console.firebase.google.com → Add project (бесплатно, план Spark).
// 2. В настройках проекта (⚙ → Project settings → General) добавьте
//    веб-приложение (</> Web) — появится объект конфигурации ниже.
// 3. Build → Authentication → Sign-in method → включите Google.
// 4. Build → Firestore Database → Create database → Start in production
//    mode, затем во вкладке Rules вставьте:
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /users/{userId} {
//          allow read, write: if request.auth != null && request.auth.uid == userId;
//        }
//      }
//    }
//
// Если оставить значения ниже пустыми ("" ) — приложение продолжит
// работать в режиме одного устройства (статистика хранится только
// в localStorage этого браузера), кнопка синхронизации не появится.

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

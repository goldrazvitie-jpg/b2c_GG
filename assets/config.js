// ============================================================
//  Подключение базы Supabase.
//  Пока поля пустые — сайт работает на демо-данных (assets/data.js):
//  квиз проходится, но результаты НЕ сохраняются и админка недоступна.
//
//  Чтобы включить сбор статистики и админ-панель:
//  1. Создайте бесплатный проект на https://supabase.com
//  2. Project Settings → API → скопируйте Project URL и anon public key
//  3. Вставьте их ниже и сохраните файл.
// ============================================================
window.SUPABASE_CONFIG = {
  url: "https://uifdnxleeqknenbmlasg.supabase.co",      // напр. "https://abcdxyz.supabase.co"
  anonKey: "sb_publishable_SNW7t0KVZPUReuri-I6DsA_vhGaHPWR"   // публичный ключ "anon public"
};

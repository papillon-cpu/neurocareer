# NEUROCAREER

AI-платформа карьерного развития и подбора сотрудников (название временное — `src/config/brand.ts`).

## Запуск

```bash
npm install
npm run dev          # http://localhost:3000, БД создаётся сама в папке .data (PGlite)
npm run db:seed -- --demo   # необязательно: демо-пользователи (пароль выводится в консоль)
```

Для PostgreSQL задайте `DATABASE_URL` (см. `.env.example`) и выполните `npm run db:migrate`.
Администратор: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed`.

## Проверки

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Документы

- [План реализации](docs/IMPLEMENTATION_PLAN.md)
- [Архитектура](docs/ARCHITECTURE.md)

## Статус

Готово: лендинг, регистрация и вход, роли (сотрудник / работодатель / администратор), кабинеты с реальной заполненностью профиля, профиль и компания, учёт согласий.
Не реализовано: резюме, тесты, AI, вакансии и подбор, оплата. Тексты согласий — черновик, нужна юридическая проверка.

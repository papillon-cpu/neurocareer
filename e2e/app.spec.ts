import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E } from "./constants";

const TITLE = `Backend-разработчик E2E ${Date.now()}`;

async function attemptLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

/** Успешный вход: ждём, пока сессия установится и страница уйдёт с /login. */
async function login(page: Page, email: string, password: string) {
  await attemptLogin(page, email, password);
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
}

async function newContext(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function registerEmployer(page: Page, email: string) {
  await page.goto("/register");
  await page.getByText("Работодатель", { exact: true }).click();
  await page.getByLabel("Имя", { exact: true }).fill("Работодатель Тестов");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole("checkbox", { name: /Обработка данных для работы сервиса/ }).check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(/\/company$/);
}

test.describe("публичная часть", () => {
  test("главная: две кнопки, в анкете регистрации роль выбирается кнопками сверху", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Создать аккаунт" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Войти" }).last()).toBeVisible();

    await page.getByRole("link", { name: "Создать аккаунт" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: "Создать аккаунт" })).toBeVisible();
    const roles = page.locator('input[type="radio"][name="role"]');
    await expect(roles).toHaveCount(2);
    await expect(page.getByRole("radio", { name: "Сотрудник" })).toBeChecked();
    await page.getByText("Работодатель", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Работодатель" })).toBeChecked();

    // ссылка с лендинга для работодателей сразу выбирает нужную роль
    await page.goto("/employers");
    await page.getByRole("link", { name: "Создать аккаунт" }).first().click();
    await expect(page.getByRole("radio", { name: "Работодатель" })).toBeChecked();
  });

  test("кабинеты закрыты без входа, здоровье сервиса отвечает", async ({ page, request }) => {
    for (const path of ["/me", "/company", "/admin", "/company/vacancies"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
  });

  test("неверный пароль не пускает", async ({ page }) => {
    await attemptLogin(page, E2E.anna.email, "wrong-password-123");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe.serial("работодатель: подписка, вакансия, подбор, контакты", () => {
  const employerEmail = `employer-${Date.now()}@example.com`;
  let vacancyUrl = "";

  test("администратор ставит лимит включённых контактов 1", async ({ browser }) => {
    const { context, page } = await newContext(browser);
    await login(page, E2E.admin.email, E2E.admin.password);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/pricing");
    await page.getByLabel("Включённых контактов за период").fill("1");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.reload();
    await expect(page.getByLabel("Включённых контактов за период")).toHaveValue("1");
    await context.close();
  });

  test("работодатель регистрируется, оформляет подписку и создаёт вакансию", async ({ page }) => {
    await registerEmployer(page, employerEmail);

    // Без подписки создавать вакансии нельзя
    await page.goto("/company/vacancies/new");
    await expect(page.getByText("Нужна действующая подписка")).toBeVisible();

    await page.goto("/company/billing");
    await page.getByRole("button", { name: /Оформить за/ }).click();
    await expect(page.getByText("ТЕСТОВАЯ ОПЛАТА")).toBeVisible();
    await page.getByRole("button", { name: "Имитировать успешную оплату" }).click();
    await expect(page).toHaveURL(/\/company\/billing$/);
    await expect(page.getByText(/Подписка действует до/)).toBeVisible();

    await page.goto("/company/vacancies/new");
    await page.getByLabel("Название вакансии").fill(TITLE);
    await page.getByLabel("Задачи").fill("Разрабатывать сервисы на TypeScript и проектировать схему PostgreSQL.");
    await page.getByLabel("Обязательные навыки").fill("TypeScript, PostgreSQL");
    await page.getByLabel("Желательные навыки").fill("Docker");
    await page.getByLabel("Опыт от, лет").fill("3");
    await page.getByLabel("Формат работы").selectOption("remote");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Вакансия сохранена.")).toBeVisible();
    vacancyUrl = new URL(page.url()).pathname;

    await page.getByRole("button", { name: "Проверить вакансию" }).click();
    await expect(page.getByText(/AI не использовался/)).toBeVisible();

    await page.getByRole("button", { name: "Отправить на модерацию" }).click();
    await expect(page.getByText("Вакансия отправлена на модерацию")).toBeVisible();
    await expect(page.getByText("Подбор доступен для одобренной вакансии")).toBeVisible();
  });

  test("другой работодатель не видит чужую вакансию", async ({ browser }) => {
    const { context, page } = await newContext(browser);
    await registerEmployer(page, `other-${Date.now()}@example.com`);
    const res = await page.goto(vacancyUrl);
    expect(res?.status()).toBe(404);
    await context.close();
  });

  test("администратор одобряет вакансию", async ({ browser }) => {
    const { context, page } = await newContext(browser);
    await login(page, E2E.admin.email, E2E.admin.password);
    await page.goto("/admin/vacancies");
    await page.locator("section", { hasText: TITLE }).getByRole("button", { name: "Одобрить" }).click();
    await expect(page.getByText("Вакансия одобрена и опубликована.")).toBeVisible();
    await context.close();
  });

  test("подбор с объяснением, контакт в лимите и платный контакт сверх лимита", async ({ page }) => {
    await login(page, employerEmail, E2E.password);
    await page.goto(vacancyUrl);
    await page.getByRole("button", { name: "Подобрать кандидатов" }).click();
    await expect(page.getByText("Подбор выполнен")).toBeVisible();

    const items = page.getByRole("listitem").filter({ hasText: "Обязательные навыки: 2 из 2" });
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("100");

    // первый кандидат: объяснение и контакт в рамках лимита
    await items.first().getByRole("link", { name: "Подробнее" }).click();
    await expect(page.getByText("Подтверждено данными")).toBeVisible();
    await expect(page.getByText("указан в разделе «Навыки» резюме").first()).toBeVisible();
    await expect(page.getByText(/Входит в подписку: будет использован контакт 1 из 1/)).toBeVisible();
    await expect(page.getByText(E2E.anna.resume)).toHaveCount(0); // контакты скрыты до открытия
    await page.getByRole("button", { name: "Открыть контакт" }).click();
    await expect(page.getByText("Контакт открыт в рамках подписки.")).toBeVisible();
    await expect(page.getByText(E2E.anna.resume)).toBeVisible();
    await expect(page.getByText("Анна Тестова")).toBeVisible();

    // жалоба на рекомендацию
    await page.getByText("Рекомендация ошибочна").click();
    await page.getByRole("button", { name: "Отправить жалобу" }).click();
    await expect(page.getByText("Жалоба отправлена администратору.")).toBeVisible();

    // второй кандидат: лимит исчерпан, цена показана до действия, контакт открывается после оплаты
    await page.goto(vacancyUrl);
    await page.getByRole("listitem").filter({ hasText: "Обязательные навыки: 2 из 2" }).nth(1).getByRole("link", { name: "Подробнее" }).click();
    await expect(page.getByText(/Лимит подписки \(1\) исчерпан/)).toBeVisible();
    await expect(page.getByText(E2E.boris.resume)).toHaveCount(0);
    await page.getByRole("button", { name: /Оплатить 200 ₽ и открыть/ }).click();
    await page.getByRole("button", { name: "Имитировать успешную оплату" }).click();
    // после оплаты пользователь возвращается на карточку кандидата, контакт открыт
    await expect(page).toHaveURL(/\/candidates\//);
    await expect(page.getByText(E2E.boris.resume)).toBeVisible();
  });

  test("администратор видит жалобу и блокирует кандидата; заблокированный не входит", async ({ browser }) => {
    const { context, page } = await newContext(browser);
    await login(page, E2E.admin.email, E2E.admin.password);
    await page.goto("/admin/reports");
    await expect(page.getByText(TITLE)).toBeVisible();
    await page.getByRole("button", { name: "Закрыть жалобу" }).first().click();
    await expect(page.getByText("Жалоба закрыта.")).toBeVisible();

    await page.goto(`/admin?q=${encodeURIComponent(E2E.anna.email)}`);
    await page.getByRole("row", { name: new RegExp(E2E.anna.email) }).getByRole("button", { name: "Заблокировать" }).click();
    await expect(page.getByText(/Пользователь заблокирован/)).toBeVisible();
    await context.close();

    const candidate = await newContext(browser);
    await attemptLogin(candidate.page, E2E.anna.email, E2E.password);
    await candidate.page.waitForTimeout(1500);
    await expect(candidate.page).toHaveURL(/\/login$/);
    await candidate.context.close();
  });
});

test.describe("демо-переключатель", () => {
  test("в демо-режиме переключает кабинеты без пароля", async ({ page }) => {
    // Демо-аккаунты создаёт db:seed --demo; здесь их нет, поэтому ожидаем понятное сообщение, а не падение.
    await page.goto("/");
    await page.getByRole("button", { name: "Работодатель", exact: true }).click();
    await expect(page).toHaveURL(/\/\?demo=missing$/);
    await expect(page.getByText(/Демо-аккаунта этой роли ещё нет/)).toBeVisible();
  });
});

import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./constants";

const stamp = Date.now();

async function register(page: Page, role: "employee" | "employer", email: string) {
  await page.goto("/register");
  if (role === "employer") await page.getByText("Работодатель", { exact: true }).click();
  await page.getByLabel("Имя", { exact: true }).fill(role === "employee" ? "Пётр Иванов" : "Анна Работодатель");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole("checkbox", { name: /Обработка данных для работы сервиса/ }).check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL(role === "employee" ? /\/me$/ : /\/company$/);
}

/** Ответить на все обязательные задания: первый вариант или «3» в шкале, свободные ответы пропускаются. */
async function answerAll(page: Page) {
  for (let i = 0; i < 60; i++) {
    const radios = page.getByRole("radio");
    if (await radios.count()) {
      await radios.nth(await radios.count() > 4 ? 2 : 0).click();
      await expect(page.getByText("Ответы сохраняются автоматически")).toBeVisible();
    }
    const next = page.getByRole("button", { name: /^(Далее|Пропустить) →$/ });
    if (!(await next.count())) break;
    await next.click();
  }
}

test.describe.serial("сотрудник: от регистрации до отчёта", () => {
  const email = `flow-employee-${stamp}@example.com`;

  test("регистрация, оплата доступа, главная и заполненность профиля", async ({ page }) => {
    await register(page, "employee", email);
    await expect(page.getByText("Откройте тесты, резюме и AI-консультанта")).toBeVisible();

    // без оплаты тесты и резюме закрыты
    await page.goto("/me/tests");
    await expect(page).toHaveURL(/\/me\/pay$/);
    await page.getByRole("button", { name: /^Оплатить/ }).click();
    await page.getByRole("button", { name: "Имитировать успешную оплату" }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByText("Откройте тесты, резюме и AI-консультанта")).toHaveCount(0);

    // «Заполнить: …» ведёт в профиль
    await page.getByRole("link", { name: /^Заполнить:/ }).click();
    await expect(page).toHaveURL(/\/me\/profile$/);
  });

  test("профиль сохраняется и переживает обновление страницы", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));

    await page.goto("/me/profile");
    await page.getByLabel("Специализация").fill("Backend-разработчик");
    await page.getByLabel("Город").fill("Казань");
    await page.getByLabel("Желаемая должность").fill("Старший разработчик");
    await page.getByLabel("О себе").fill("Шесть лет разрабатываю серверные приложения на Node.js и PostgreSQL.");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Профиль сохранён.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Город")).toHaveValue("Казань");
    await expect(page.getByLabel("Специализация")).toHaveValue("Backend-разработчик");

    await page.goto("/me");
    await expect(page.getByText(/Заполненность профиля/i)).toBeVisible();
  });

  test("тест: ответы сохраняются при обновлении, результат и отчёт", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));

    await page.goto("/me/tests");
    await expect(page.getByText("Soft Skills")).toBeVisible();
    await expect(page.getByText("Аналитические способности")).toBeVisible();
    await expect(page.getByText("Управленческий потенциал")).toBeVisible();

    await page.goto("/me/tests/analytics");
    await page.getByRole("button", { name: "Начать тест" }).click();
    await expect(page).toHaveURL(/\/me\/tests\/attempt\//);

    // первый ответ, обновление страницы, ответ сохранён
    await page.getByRole("radio").first().click();
    await expect(page.getByText("Ответы сохраняются автоматически")).toBeVisible();
    const attemptUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(attemptUrl);
    await expect(page.getByText(/Отвечено 1 из/)).toBeVisible();

    // кнопка завершения закрыта, пока не отвечены все
    await expect(page.getByRole("button", { name: "Завершить и посмотреть результат" })).toBeDisabled();

    await page.getByRole("button", { name: "Задание 1, есть ответ" }).click();
    await answerAll(page);
    await expect(page.getByRole("button", { name: "Завершить и посмотреть результат" })).toBeEnabled();
    await page.getByRole("button", { name: "Завершить и посмотреть результат" }).click();
    await expect(page).toHaveURL(/\/me\/tests\/report\//);
    await expect(page.getByText("Аналитические способности").first()).toBeVisible();

    // отчёт открывается заново после обновления; в списке тестов появился результат
    await page.reload();
    await expect(page.getByText("Аналитические способности").first()).toBeVisible();
    await page.goto("/me/tests");
    await expect(page.getByText(/Последний результат/)).toBeVisible();
  });

  test("резюме: создание, переключение шаблонов, сохранение", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));

    await page.goto("/me/resume");
    await page.getByRole("button", { name: "Создать с нуля" }).click();
    await expect(page).toHaveURL(/\/me\/resume\/[0-9a-f-]+/);

    const classic = page.getByRole("radio", { name: "Классический" });
    const modern = page.getByRole("radio", { name: "С боковой колонкой" });
    await expect(classic).toBeChecked();
    await page.getByText("С боковой колонкой", { exact: true }).click();
    await expect(modern).toBeChecked();
    await page.getByText("Классический", { exact: true }).click();
    await expect(classic).toBeChecked();
    await page.getByText("С боковой колонкой", { exact: true }).click();

    await page.getByLabel("Специализация").fill("Старший Backend-разработчик");
    await page.getByRole("button", { name: "Сохранить" }).first().click();
    await expect(page.getByText("Резюме сохранено.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("radio", { name: "С боковой колонкой" })).toBeChecked();
    await expect(page.getByLabel("Специализация")).toHaveValue("Старший Backend-разработчик");
  });

  test("все разделы кабинета открываются, приватность и консультант без ошибок", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));

    for (const path of ["/me", "/me/profile", "/me/tests", "/me/resume", "/me/assistant", "/me/privacy"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByText("Application error")).toHaveCount(0);
    }
    // навигация по меню кабинета
    for (const name of ["Профиль", "Тесты", "Резюме", "Консультант", "Приватность", "Главная"]) {
      await page.getByRole("navigation").getByRole("link", { name, exact: true }).first().click();
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
  });

  test("выход закрывает кабинет, кнопка «назад» не показывает данные", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));
    await page.goto("/me/profile");

    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/me/profile");
    await expect(page).toHaveURL(/\/login$/);
    // «назад» и обновление не возвращают данные кабинета: либо вход, либо публичная страница
    await page.goBack();
    await page.reload();
    await expect(page.getByText("Профессиональный профиль")).toHaveCount(0);
    await expect(page.getByText(email)).toHaveCount(0);
  });
});

test.describe.serial("работодатель: компания", () => {
  const email = `flow-employer-${stamp}@example.com`;

  test("заполненность компании: ссылка «Заполнить» ведёт в настройки, данные сохраняются", async ({ page }) => {
    await register(page, "employer", email);
    await expect(page.getByText("Заполненность компании")).toBeVisible();

    await page.getByRole("link", { name: /^Заполнить:/ }).click();
    await expect(page).toHaveURL(/\/company\/settings$/);

    await page.getByLabel("Ваша должность").fill("HR-директор");
    await page.getByLabel("Название компании").fill("ООО Пример");
    await page.getByLabel("Отрасль").fill("Разработка ПО");
    await page.locator('input[name="site"]').fill("https://example.com");
    await page.getByLabel("Описание компании").fill("Делаем программы для бизнеса.");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText(/сохранен/i)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Название компании")).toHaveValue("ООО Пример");

    await page.goto("/company");
    await expect(page.getByText("Заполненность компании")).toBeVisible();
    await expect(page.getByText("14%")).toHaveCount(0);
  });

  test("разделы кабинета и меню работают", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(E2E.password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));

    for (const path of ["/company", "/company/vacancies", "/company/favorites", "/company/settings", "/company/billing"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
    }
    for (const name of ["Вакансии", "Избранное", "Компания", "Подписка", "Главная"]) {
      await page.getByRole("navigation").getByRole("link", { name, exact: true }).first().click();
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
    // сотруднику чужой кабинет недоступен
    const res = await page.goto("/me");
    expect(page.url()).not.toMatch(/\/me$/);
    expect(res?.status()).toBeLessThan(500);
  });
});

test("регистрация: дубль email, короткий пароль, без согласия", async ({ page }) => {
  const email = `dup-${stamp}@example.com`;
  await register(page, "employee", email);
  await page.getByRole("button", { name: "Выйти" }).click();

  await page.goto("/register");
  await page.getByLabel("Имя", { exact: true }).fill("Дубль");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole("checkbox", { name: /Обработка данных для работы сервиса/ }).check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText(/уже зарегистрирован/)).toBeVisible();

  await page.locator('input[name="email"]').fill(`short-${stamp}@example.com`);
  await page.locator('input[name="password"]').fill("short");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText(/не короче 10/)).toBeVisible();

  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole("checkbox", { name: /Обработка данных для работы сервиса/ }).uncheck();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText(/Нужно согласие/)).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

test.describe("страницы без ошибок в консоли и 5xx", () => {
  function watch(page: Page) {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
    });
    return problems;
  }

  async function signIn(page: Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  }

  test("сотрудник (с доступом): все тесты проходятся, разделы открываются", async ({ page }) => {
    const problems = watch(page);
    await signIn(page, E2E.boris.email, E2E.password);
    for (const slug of ["soft-skills", "management"]) {
      await page.goto(`/me/tests/${slug}`);
      const start = page.getByRole("button", { name: /(Начать|Продолжить) тест/ });
      if (!(await start.count())) continue;
      await start.click();
      await expect(page).toHaveURL(/\/me\/tests\/attempt\//);
      await expect(page.getByRole("progressbar")).toBeVisible();
      await answerAll(page);
      await page.getByRole("button", { name: "Завершить и посмотреть результат" }).click();
      await expect(page).toHaveURL(/\/me\/tests\/report\//);
      await expect(page.getByText("Application error")).toHaveCount(0);
    }
    for (const path of ["/me", "/me/profile", "/me/tests", "/me/resume", "/me/assistant", "/me/privacy", "/me/resume/import"]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test("администратор: все разделы", async ({ page }) => {
    const problems = watch(page);
    await signIn(page, E2E.admin.email, E2E.admin.password);
    for (const path of ["/admin", "/admin/vacancies", "/admin/reports", "/admin/pricing"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test("публичные страницы и несуществующий адрес", async ({ page }) => {
    const problems = watch(page);
    for (const path of ["/", "/employees", "/employers", "/login", "/register", "/register?role=employer", "/forgot-password"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
    }
    const missing = await page.goto("/no-such-page");
    expect(missing?.status()).toBe(404);
    expect(problems.filter((p) => !p.startsWith("console: Failed"))).toEqual([]);
  });
});

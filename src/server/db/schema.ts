import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  uniqueIndex,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("user_role", ["employee", "employer", "admin"]);

export const consentPurposeEnum = pgEnum("consent_purpose", [
  "service_processing",
  "profile_publication",
  "employer_data_sharing",
  "external_ai",
  "ai_matching",
  "marketing",
]);

export const resumeSourceEnum = pgEnum("resume_source", ["manual", "import"]);

export const attemptStatusEnum = pgEnum("attempt_status", ["in_progress", "completed"]);

export const paymentKindEnum = pgEnum("payment_kind", ["employee_access", "employer_subscription", "extra_contact"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "canceled"]);

export const workFormatEnum = pgEnum("work_format", ["office", "hybrid", "remote"]);

export const vacancyStatusEnum = pgEnum("vacancy_status", ["draft", "pending", "published", "rejected", "closed"]);
export const vacancyLevelEnum = pgEnum("vacancy_level", ["intern", "junior", "middle", "senior", "lead"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Всегда хранится в нижнем регистре, уникален.
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Аккаунт удалён: персональные данные стёрты, строка остаётся из-за финансовых записей.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Аккаунт заблокирован администратором: войти нельзя, профиль из подбора пропадает.
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // В БД лежит только sha256 токена, сам токен есть лишь в cookie пользователя.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const employeeProfiles = pgTable("employee_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  headline: text("headline").notNull().default(""),
  city: text("city").notNull().default(""),
  desiredRole: text("desired_role").notNull().default(""),
  workFormat: workFormatEnum("work_format"),
  about: text("about").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  site: text("site").notNull().default(""),
  industry: text("industry").notNull().default(""),
  size: text("size").notNull().default(""),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employerProfiles = pgTable("employer_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull().default(""),
  position: text("position").notNull().default(""),
});

// Каждое согласие — отдельная запись: цель, версия текста, дата, статус.
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: consentPurposeEnum("purpose").notNull(),
    textVersion: text("text_version").notNull(),
    granted: boolean("granted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_user_purpose_idx").on(t.userId, t.purpose)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    // Только технические данные, без персональных.
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_type_idx").on(t.type, t.createdAt)],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type ConsentPurpose = (typeof consentPurposeEnum.enumValues)[number];

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resumes_user_idx").on(t.userId)],
);

// Версия — отдельный вариант содержимого резюме (например, под конкретную вакансию).
export const resumeVersions = pgTable(
  "resume_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    content: jsonb("content").$type<unknown>().notNull(),
    source: resumeSourceEnum("source").notNull().default("manual"),
    // Исходный текст загруженного файла: показывается рядом при проверке. Сам файл не хранится.
    sourceText: text("source_text"),
    // Что нужно проверить пользователю; пусто — проверка подтверждена.
    reviewNotes: jsonb("review_notes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resume_versions_resume_idx").on(t.resumeId)],
);

// Определения тестов и их версии лежат в коде (modules/assessments/definitions) вместе с ключами проверки,
// которые никогда не уходят на клиент. В БД — прохождения: какая версия методики, порядок, ответы, итог.
export const assessmentAttempts = pgTable(
  "assessment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    version: integer("version").notNull(),
    // Из seed детерминированно получается порядок заданий и вариантов ответа.
    seed: integer("seed").notNull(),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("attempts_user_idx").on(t.userId, t.slug),
    // Не больше одной незавершённой попытки одного теста у пользователя.
    uniqueIndex("attempts_one_active_idx")
      .on(t.userId, t.slug)
      .where(sql`${t.status} = 'in_progress'`),
  ],
);

export const assessmentAnswers = pgTable(
  "assessment_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => assessmentAttempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    value: jsonb("value").$type<string | number>().notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("answers_attempt_question_idx").on(t.attemptId, t.questionId)],
);

// Один результат на попытку (unique): повторное завершение не создаёт и не начисляет ничего заново.
export const assessmentResults = pgTable("assessment_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id")
    .notNull()
    .unique()
    .references(() => assessmentAttempts.id, { onDelete: "cascade" }),
  // Полный снимок отчёта на момент прохождения: старые результаты не меняются при обновлении методики.
  report: jsonb("report").$type<unknown>().notNull(),
  // AI-пояснение к отчёту: создаётся по запросу пользователя и хранится, чтобы не тратить запросы повторно.
  aiCommentary: jsonb("ai_commentary").$type<unknown>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Журнал вызовов AI: только технические данные, без текста запросов и ответов.
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    // ok или код ошибки: timeout, rate_limited, auth, invalid_output, ...
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_idx").on(t.userId, t.createdAt)],
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Новый диалог"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_conv_user_idx").on(t.userId, t.updatedAt)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_msg_conv_idx").on(t.conversationId, t.createdAt)],
);

/* ---------- оплата ---------- */

// Деньги везде в копейках (целые числа). Платёж меняет статус только по подтверждённому событию провайдера.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: paymentKindEnum("kind").notNull(),
    amountKopecks: integer("amount_kopecks").notNull(),
    currency: text("currency").notNull().default("RUB"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("payments_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("payments_provider_id_idx").on(t.provider, t.providerPaymentId),
  ],
);

// Журнал событий провайдера: уникальный (провайдер, id события) делает обработку идемпотентной.
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_unique_idx").on(t.provider, t.eventId)],
);

// Разовый доступ сотрудника (после оплаты открываются тесты, резюме, AI).
export const employeeAccess = pgTable("employee_access", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

// Один оплаченный период подписки. Цены и лимиты зафиксированы на момент покупки: смена тарифа не трогает текущий период.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    priceKopecks: integer("price_kopecks").notNull(),
    includedContacts: integer("included_contacts").notNull(),
    extraContactKopecks: integer("extra_contact_kopecks").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId, t.periodEnd)],
);

// Открытый работодателем контакт кандидата в рамках периода. Уникальность исключает повторное списание.
export const contactUnlocks = pgTable(
  "contact_unlocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerUserId: uuid("employer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    chargeKind: text("charge_kind").$type<"included" | "paid">().notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contact_unlock_unique_idx").on(t.subscriptionId, t.candidateUserId)],
);

// Настройки продукта, меняемые администратором (тарифы и лимиты).
export const adminSettings = pgTable("admin_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

// Что и кому видно. По умолчанию всё закрыто: профиль не опубликован, контакты и результаты тестов не передаются.
export const profileVisibility = pgTable("profile_visibility", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  published: boolean("published").notNull().default(false),
  // Версия резюме, которую пользователь проверил и разрешил показывать.
  resumeVersionId: uuid("resume_version_id").references(() => resumeVersions.id, { onDelete: "set null" }),
  shareEmail: boolean("share_email").notNull().default(false),
  sharePhone: boolean("share_phone").notNull().default(false),
  shareTestResults: boolean("share_test_results").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- вакансии и подбор ---------- */

// Вакансия работодателя. Статус «опубликована» ставит только администратор (модерация).
export const vacancies = pgTable(
  "vacancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerUserId: uuid("employer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    tasks: text("tasks").notNull().default(""),
    mustSkills: jsonb("must_skills").$type<string[]>().notNull().default([]),
    niceSkills: jsonb("nice_skills").$type<string[]>().notNull().default([]),
    minExperienceYears: integer("min_experience_years"),
    level: vacancyLevelEnum("level"),
    workFormat: workFormatEnum("work_format"),
    city: text("city").notNull().default(""),
    salaryFrom: integer("salary_from"),
    salaryTo: integer("salary_to"),
    extra: text("extra").notNull().default(""),
    status: vacancyStatusEnum("status").notNull().default("draft"),
    // Причина отклонения или снятия, видна работодателю.
    moderationNote: text("moderation_note").notNull().default(""),
    // Структурированный разбор требований (AI или правила) и откуда он получен.
    analysis: jsonb("analysis").$type<unknown>(),
    analysisSource: text("analysis_source").$type<"ai" | "rules">(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vacancies_employer_idx").on(t.employerUserId, t.status), index("vacancies_status_idx").on(t.status, t.updatedAt)],
);

// История рекомендаций для аудита: что и почему показали работодателю. Персональных данных кандидата здесь нет:
// только оценка совпадения и названия навыков. runId объединяет результаты одного запуска подбора.
export const matchRecommendations = pgTable(
  "match_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vacancyId: uuid("vacancy_id")
      .notNull()
      .references(() => vacancies.id, { onDelete: "cascade" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    rank: integer("rank").notNull(),
    score: integer("score").notNull(),
    mustMatched: integer("must_matched").notNull(),
    mustTotal: integer("must_total").notNull(),
    explanation: jsonb("explanation").$type<unknown>().notNull(),
    // Вывод AI (отдельно от данных); null, если не запрашивался.
    aiInference: jsonb("ai_inference").$type<unknown>(),
    algorithmVersion: text("algorithm_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_rec_vacancy_idx").on(t.vacancyId, t.runId), index("match_rec_candidate_idx").on(t.candidateUserId)],
);

// Жалобы работодателей на ошибочные рекомендации; разбирает администратор.
export const recommendationReports = pgTable(
  "recommendation_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recommendationId: uuid("recommendation_id")
      .notNull()
      .references(() => matchRecommendations.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    comment: text("comment").notNull().default(""),
    status: text("status").$type<"open" | "resolved">().notNull().default("open"),
    resolutionNote: text("resolution_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("rec_report_unique_idx").on(t.recommendationId, t.reporterUserId), index("rec_report_status_idx").on(t.status, t.createdAt)],
);

/** Счётчики ограничения частоты общие для всех инстансов приложения. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/** Одноразовые ссылки восстановления пароля. В БД только sha256 токена. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_user_idx").on(t.userId)],
);

/** Избранные кандидаты работодателя. vacancy_id — вакансия, по которой кандидат был рекомендован: через неё открывается карточка. */
export const employerFavorites = pgTable(
  "employer_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerUserId: uuid("employer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateUserId: uuid("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vacancyId: uuid("vacancy_id")
      .notNull()
      .references(() => vacancies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("employer_favorites_unique_idx").on(t.employerUserId, t.candidateUserId)],
);

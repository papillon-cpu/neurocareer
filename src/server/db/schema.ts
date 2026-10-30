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
  "marketing",
]);

export const resumeSourceEnum = pgEnum("resume_source", ["manual", "import"]);

export const attemptStatusEnum = pgEnum("attempt_status", ["in_progress", "completed"]);

export const workFormatEnum = pgEnum("work_format", ["office", "hybrid", "remote"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Всегда хранится в нижнем регистре, уникален.
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

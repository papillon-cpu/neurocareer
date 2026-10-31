import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Введите корректный email").max(254, "Слишком длинный email"));

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Укажите имя").max(120),
  email,
  password: z
    .string()
    .min(10, "Пароль должен быть не короче 10 символов")
    .max(128, "Пароль не длиннее 128 символов"),
  role: z.enum(["employee", "employer"], { error: "Выберите, кто вы" }),
  acceptService: z.literal(true, {
    error: "Нужно согласие на обработку данных для работы сервиса",
  }),
  acceptMarketing: z.boolean(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Введите пароль").max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/** Преобразует FormData в простой объект: чекбоксы становятся boolean. */
export function formToObject(form: FormData, checkboxes: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  for (const name of checkboxes) out[name] = form.get(name) === "on";
  return out;
}

export type FormState = {
  ok?: boolean;
  /** Введённые значения (без паролей): React 19 очищает поля после отправки, их нужно вернуть обратно. */
  values?: Record<string, string>;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function echoValues(form: FormData, skip: string[] = ["password"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !skip.includes(key)) out[key] = value;
  }
  return out;
}

export function zodState(error: z.ZodError, form?: FormData): FormState {
  return {
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
    values: form ? echoValues(form) : undefined,
  };
}

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: registerSchema.shape.password,
});

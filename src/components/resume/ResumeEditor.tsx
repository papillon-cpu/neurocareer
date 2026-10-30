"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  confirmReviewAction,
  deleteResumeAction,
  deleteVersionAction,
  newVersionAction,
  saveVersionAction,
} from "@/modules/resume/actions";
import { TEMPLATES, type ResumeContent } from "@/modules/resume/content";
import { Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/Field";
import { ResumeView } from "./ResumeView";

type VersionInfo = { id: string; label: string; needsReview: boolean };

type Props = {
  resumeId: string;
  versionId: string;
  initialLabel: string;
  initialContent: ResumeContent;
  reviewNotes: string[];
  sourceText: string | null;
  versions: VersionInfo[];
};

const btn =
  "rounded-full border border-line px-4 py-1.5 text-xs text-mist transition-colors hover:border-neuron hover:text-neuron";

function Group({ title, onAdd, addLabel, children }: { title: string; onAdd?: () => void; addLabel?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-3xl border border-line p-5">
      <legend className="px-2 font-mono text-xs uppercase tracking-[0.15em] text-mist">{title}</legend>
      {children}
      {onAdd && (
        <button type="button" onClick={onAdd} className={btn}>
          + {addLabel ?? "Добавить"}
        </button>
      )}
    </fieldset>
  );
}

function Item({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl bg-graphite p-4">
      {children}
      <button type="button" onClick={onRemove} className="text-xs text-danger hover:underline">
        Удалить запись
      </button>
    </div>
  );
}

export function ResumeEditor(p: Props) {
  const [content, setContent] = useState(p.initialContent);
  const [label, setLabel] = useState(p.initialLabel);
  const [state, action, pending] = useActionState(saveVersionAction, {});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const patchBasics = (k: keyof ResumeContent["basics"], v: string) =>
    setContent((c) => ({ ...c, basics: { ...c.basics, [k]: v } }));

  function patchList<K extends "experience" | "education" | "languages" | "certificates" | "projects">(
    key: K,
    i: number,
    field: string,
    value: string,
  ) {
    setContent((c) => ({
      ...c,
      [key]: (c[key] as Record<string, string>[]).map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    }));
  }
  const removeAt = (key: "experience" | "education" | "languages" | "certificates" | "projects", i: number) =>
    setContent((c) => ({ ...c, [key]: (c[key] as unknown[]).filter((_, idx) => idx !== i) }));
  const add = (key: "experience" | "education" | "languages" | "certificates" | "projects", row: Record<string, string>) =>
    setContent((c) => ({ ...c, [key]: [...(c[key] as unknown[]), row] }));

  const b = content.basics;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        {p.versions.map((v) => (
          <Link
            key={v.id}
            href={`/me/resume/${p.resumeId}?v=${v.id}`}
            aria-current={v.id === p.versionId ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-xs ${
              v.id === p.versionId ? "bg-neuron font-semibold text-ink" : "border border-line text-mist hover:text-snow"
            }`}
          >
            {v.label}
            {v.needsReview ? " · проверить" : ""}
          </Link>
        ))}
        <Link href={`/me/resume/${p.resumeId}/print?v=${p.versionId}`} className={`${btn} ml-auto`}>
          Сохранить как PDF
        </Link>
      </div>

      {p.reviewNotes.length > 0 && (
        <section className="rounded-3xl border border-violet/60 bg-violet/10 p-6" aria-labelledby="review-title">
          <h2 id="review-title" className="font-semibold">
            Проверьте данные, прежде чем пользоваться резюме
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-mist">
            {p.reviewNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {p.sourceText && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-neuron">Исходный текст из файла</summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-graphite p-4 text-xs text-mist">
                {p.sourceText}
              </pre>
            </details>
          )}
          <form action={confirmReviewAction} className="mt-4">
            <input type="hidden" name="versionId" value={p.versionId} />
            <button type="submit" className={btn}>
              Я проверил(а) все данные
            </button>
            <p className="mt-2 text-xs text-mist">Сначала исправьте и сохраните резюме ниже, затем подтвердите проверку.</p>
          </form>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form action={action} className="space-y-6" noValidate>
          <input type="hidden" name="versionId" value={p.versionId} />
          <input type="hidden" name="content" value={JSON.stringify(content)} />
          <FormMessage error={state.error} ok={state.ok ? "Резюме сохранено." : undefined} />

          <Field label="Название версии">
            <Input name="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required />
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Шаблон</legend>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <label
                  key={t.id}
                  className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs ${
                    content.template === t.id ? "border-neuron bg-neuron/10 text-neuron" : "border-line text-mist"
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    className="sr-only"
                    checked={content.template === t.id}
                    onChange={() => setContent((c) => ({ ...c, template: t.id }))}
                  />
                  {t.title}
                </label>
              ))}
            </div>
          </fieldset>

          <Group title="Основное">
            <Field label="Имя и фамилия">
              <Input value={b.fullName} onChange={(e) => patchBasics("fullName", e.target.value)} />
            </Field>
            <Field label="Специализация">
              <Input value={b.headline} onChange={(e) => patchBasics("headline", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Email">
                <Input value={b.email} onChange={(e) => patchBasics("email", e.target.value)} />
              </Field>
              <Field label="Телефон">
                <Input value={b.phone} onChange={(e) => patchBasics("phone", e.target.value)} />
              </Field>
              <Field label="Город">
                <Input value={b.city} onChange={(e) => patchBasics("city", e.target.value)} />
              </Field>
            </div>
            <Field label="О себе">
              <Textarea value={b.summary} onChange={(e) => patchBasics("summary", e.target.value)} />
            </Field>
          </Group>

          <Group title="Опыт работы" onAdd={() => add("experience", { company: "", position: "", start: "", end: "", description: "" })} addLabel="Добавить место работы">
            {content.experience.map((e, i) => (
              <Item key={i} onRemove={() => removeAt("experience", i)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Должность">
                    <Input value={e.position} onChange={(ev) => patchList("experience", i, "position", ev.target.value)} />
                  </Field>
                  <Field label="Компания">
                    <Input value={e.company} onChange={(ev) => patchList("experience", i, "company", ev.target.value)} />
                  </Field>
                  <Field label="Начало" hint="Например: 03.2020">
                    <Input value={e.start} onChange={(ev) => patchList("experience", i, "start", ev.target.value)} />
                  </Field>
                  <Field label="Окончание" hint="Или «по настоящее время»">
                    <Input value={e.end} onChange={(ev) => patchList("experience", i, "end", ev.target.value)} />
                  </Field>
                </div>
                <Field label="Что делали и каких результатов достигли">
                  <Textarea value={e.description} onChange={(ev) => patchList("experience", i, "description", ev.target.value)} />
                </Field>
              </Item>
            ))}
          </Group>

          <Group title="Образование" onAdd={() => add("education", { institution: "", degree: "", start: "", end: "" })}>
            {content.education.map((e, i) => (
              <Item key={i} onRemove={() => removeAt("education", i)}>
                <Field label="Учебное заведение">
                  <Input value={e.institution} onChange={(ev) => patchList("education", i, "institution", ev.target.value)} />
                </Field>
                <Field label="Специальность, степень">
                  <Input value={e.degree} onChange={(ev) => patchList("education", i, "degree", ev.target.value)} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Начало">
                    <Input value={e.start} onChange={(ev) => patchList("education", i, "start", ev.target.value)} />
                  </Field>
                  <Field label="Окончание">
                    <Input value={e.end} onChange={(ev) => patchList("education", i, "end", ev.target.value)} />
                  </Field>
                </div>
              </Item>
            ))}
          </Group>

          <Group title="Навыки">
            <Field label="Через запятую" hint="Например: Playwright, SQL, управление командой">
              <Textarea
                value={content.skills.join(", ")}
                onChange={(e) => setContent((c) => ({ ...c, skills: e.target.value.split(/[,;\n]/).map((s) => s.trim()) }))}
              />
            </Field>
          </Group>

          <Group title="Языки" onAdd={() => add("languages", { name: "", level: "" })}>
            {content.languages.map((l, i) => (
              <Item key={i} onRemove={() => removeAt("languages", i)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Язык">
                    <Input value={l.name} onChange={(ev) => patchList("languages", i, "name", ev.target.value)} />
                  </Field>
                  <Field label="Уровень">
                    <Input value={l.level} onChange={(ev) => patchList("languages", i, "level", ev.target.value)} />
                  </Field>
                </div>
              </Item>
            ))}
          </Group>

          <Group title="Сертификаты и курсы" onAdd={() => add("certificates", { name: "", issuer: "", year: "" })}>
            {content.certificates.map((x, i) => (
              <Item key={i} onRemove={() => removeAt("certificates", i)}>
                <Field label="Название">
                  <Input value={x.name} onChange={(ev) => patchList("certificates", i, "name", ev.target.value)} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Организация">
                    <Input value={x.issuer} onChange={(ev) => patchList("certificates", i, "issuer", ev.target.value)} />
                  </Field>
                  <Field label="Год">
                    <Input value={x.year} onChange={(ev) => patchList("certificates", i, "year", ev.target.value)} />
                  </Field>
                </div>
              </Item>
            ))}
          </Group>

          <Group title="Проекты" onAdd={() => add("projects", { name: "", description: "" })}>
            {content.projects.map((x, i) => (
              <Item key={i} onRemove={() => removeAt("projects", i)}>
                <Field label="Название">
                  <Input value={x.name} onChange={(ev) => patchList("projects", i, "name", ev.target.value)} />
                </Field>
                <Field label="Описание">
                  <Textarea value={x.description} onChange={(ev) => patchList("projects", i, "description", ev.target.value)} />
                </Field>
              </Item>
            ))}
          </Group>

          <div className="sticky bottom-4 flex items-center gap-4 rounded-full border border-line bg-panel/95 px-5 py-3 backdrop-blur">
            <SubmitButton pending={pending}>Сохранить</SubmitButton>
            {state.ok && <span className="text-xs text-neuron">Сохранено</span>}
          </div>
        </form>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.15em] text-mist">Предпросмотр</p>
            <ResumeView content={content} />
          </div>

          <section className="space-y-4 rounded-3xl border border-line p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.15em] text-mist">Версии и удаление</h2>
            <form action={newVersionAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="resumeId" value={p.resumeId} />
              <input type="hidden" name="fromVersionId" value={p.versionId} />
              <input
                name="label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Например: под вакансию Lead QA"
                maxLength={80}
                required
                className="min-w-0 flex-1 rounded-full border border-line bg-graphite px-4 py-2 text-xs focus:border-neuron focus:outline-none"
              />
              <button type="submit" className={btn}>
                Копия версии
              </button>
            </form>
            <p className="text-xs text-mist">Копия создаётся из сохранённой версии, а не из несохранённых правок.</p>

            {p.versions.length > 1 && (
              <form action={deleteVersionAction}>
                <input type="hidden" name="resumeId" value={p.resumeId} />
                <input type="hidden" name="versionId" value={p.versionId} />
                <button type="submit" className="text-xs text-danger hover:underline">
                  Удалить эту версию
                </button>
              </form>
            )}

            {confirmDelete ? (
              <form action={deleteResumeAction} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="resumeId" value={p.resumeId} />
                <span className="text-xs">Удалить резюме со всеми версиями? Это необратимо.</span>
                <button type="submit" className="rounded-full bg-danger px-4 py-1.5 text-xs font-semibold text-ink">
                  Да, удалить
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={btn}>
                  Отмена
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="block text-xs text-danger hover:underline">
                Удалить резюме целиком
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

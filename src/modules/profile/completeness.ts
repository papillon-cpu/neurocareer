export type CompletenessItem = { key: string; label: string; done: boolean };

export type Completeness = {
  percent: number;
  items: CompletenessItem[];
  next: CompletenessItem | null;
};

function build(items: CompletenessItem[]): Completeness {
  const done = items.filter((i) => i.done).length;
  return {
    percent: Math.round((done / items.length) * 100),
    items,
    next: items.find((i) => !i.done) ?? null,
  };
}

const filled = (v: string | null | undefined) => (v ?? "").trim().length > 0;

export const ABOUT_MIN_LENGTH = 50;

export function employeeCompleteness(p: {
  fullName: string;
  headline: string;
  city: string;
  desiredRole: string;
  workFormat: string | null;
  about: string;
}): Completeness {
  return build([
    { key: "fullName", label: "Имя", done: filled(p.fullName) },
    { key: "headline", label: "Специализация", done: filled(p.headline) },
    { key: "city", label: "Город", done: filled(p.city) },
    { key: "desiredRole", label: "Желаемая должность", done: filled(p.desiredRole) },
    { key: "workFormat", label: "Формат работы", done: filled(p.workFormat) },
    {
      key: "about",
      label: `О себе (от ${ABOUT_MIN_LENGTH} символов)`,
      done: p.about.trim().length >= ABOUT_MIN_LENGTH,
    },
  ]);
}

export function employerCompleteness(p: {
  fullName: string;
  position: string;
  company: {
    name: string;
    site: string;
    industry: string;
    size: string;
    description: string;
  } | null;
}): Completeness {
  const c = p.company;
  return build([
    { key: "fullName", label: "Ваше имя", done: filled(p.fullName) },
    { key: "position", label: "Ваша должность", done: filled(p.position) },
    { key: "name", label: "Название компании", done: filled(c?.name) },
    { key: "industry", label: "Отрасль", done: filled(c?.industry) },
    { key: "size", label: "Размер компании", done: filled(c?.size) },
    { key: "site", label: "Сайт", done: filled(c?.site) },
    { key: "description", label: "Описание компании", done: filled(c?.description) },
  ]);
}

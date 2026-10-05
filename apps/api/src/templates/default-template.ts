import type { Locale } from "@plano/shared";

// The starter funnel every new workspace gets (and the seed installs): a
// ready-made onboarding project. Its cards walk a new user through the system.
interface StarterCard {
  title: string;
  description?: string;
  estimateHours?: number;
  checklist: string[];
}
interface StarterTemplate {
  name: string;
  columns: string[];
  cards: StarterCard[];
}


export const DEFAULT_TEMPLATES: Record<Locale, StarterTemplate> = {
  ru: {
    name: "Знакомство с Plano",
    columns: ["Бэклог", "В работе", "На проверке", "Готово"],
    cards: [
      {
        title: "Осмотреть доску",
        description: "Доска — это проект. Слева направо идут этапы, в них лежат карточки-задачи.",
        checklist: ["Найти этапы доски", "Открыть карточку кликом", "Перетащить карточку на другой этап"],
      },
      {
        title: "Заполнить карточку",
        description: "В карточке живёт всё по задаче: описание, исполнители, срок, подзадачи, комментарии и файлы.",
        checklist: ["Написать описание", "Назначить исполнителя и срок", "Добавить подзадачи", "Оставить комментарий"],
      },
      {
        title: "Настроить пространство",
        description: "Название компании, префикс номеров карточек и этапы по умолчанию меняются в «Настройках».",
        checklist: ["Открыть «Настройки»", "Задать название и префикс", "Добавить метки"],
      },
      {
        title: "Пригласить команду",
        description: "Сотрудники присоединяются по ссылке. Права задаются ролями.",
        checklist: ["Пригласить коллегу по почте", "Выбрать роль", "Назначить ему карточку"],
      },
      {
        title: "Создать свой первый проект",
        description: "Новый проект можно собрать из шаблона или с нуля. Эту доску можно удалить.",
        checklist: ["Нажать «Новый проект»", "Выбрать шаблон", "Добавить первые карточки"],
      },
      {
        title: "Попробовать другие виды",
        description: "Те же карточки можно смотреть таблицей, списком, календарём и диаграммой Ганта.",
        checklist: ["Переключить вид на «Таблицу»", "Открыть «Календарь»", "Применить фильтр или поиск"],
      },
      {
        title: "Вести время и повторять задачи",
        description: "Время списывается в карточке. Регулярные дела — повторяющимися правилами в настройках проекта.",
        estimateHours: 1,
        checklist: ["Списать время в карточке", "Создать повторяющееся правило"],
      },
    ],
  },
  en: {
    name: "Getting started with Plano",
    columns: ["Backlog", "In progress", "In review", "Done"],
    cards: [
      {
        title: "Look around the board",
        description: "A board is a project. Stages run left to right and hold cards, which are tasks.",
        checklist: ["Find the board stages", "Open a card with a click", "Drag a card to another stage"],
      },
      {
        title: "Fill in a card",
        description: "A card holds everything about a task: description, assignees, due date, subtasks, comments and files.",
        checklist: ["Write a description", "Set an assignee and a due date", "Add subtasks", "Leave a comment"],
      },
      {
        title: "Set up your workspace",
        description: "Company name, card key prefix and default stages are changed in Settings.",
        checklist: ["Open Settings", "Set the name and prefix", "Add labels"],
      },
      {
        title: "Invite your team",
        description: "People join through a link. Access is controlled by roles.",
        checklist: ["Invite a colleague by email", "Pick a role", "Assign them a card"],
      },
      {
        title: "Create your first real project",
        description: "A new project can be built from a template or from scratch. You can delete this board.",
        checklist: ["Click New project", "Choose a template", "Add the first cards"],
      },
      {
        title: "Try the other views",
        description: "The same cards can be viewed as a table, a list, a calendar and a Gantt chart.",
        checklist: ["Switch the view to Table", "Open Calendar", "Apply a filter or search"],
      },
      {
        title: "Track time and repeat tasks",
        description: "Time is logged on the card. Routine work is set up as recurring rules in project settings.",
        estimateHours: 1,
        checklist: ["Log time on a card", "Create a recurring rule"],
      },
    ],
  },
};

export const defaultTemplateNames = () => Object.values(DEFAULT_TEMPLATES).map((t) => t.name);

// Nested create input for Template.
export const templateCreateData = (locale: Locale = "ru") => {
  const t = DEFAULT_TEMPLATES[locale];
  return {
    name: t.name,
    columns: t.columns,
    cards: {
      create: t.cards.map((c, i) => ({
        title: c.title,
        description: c.description,
        estimateHours: c.estimateHours,
        checklist: c.checklist,
        position: i + 1,
      })),
    },
  };
};

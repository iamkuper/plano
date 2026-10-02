// Starter template every new workspace gets (and the seed installs).
export const DEFAULT_TEMPLATE = {
  name: "Типовой проект",
  columns: ["Бэклог", "В работе", "На проверке", "Готово"],
  cards: [
    { title: "Бриф и требования", type: "SETUP" as const, estimateHours: 3, checklist: ["Встреча с клиентом", "Цели и критерии успеха", "Ограничения и сроки"] },
    { title: "План работ и оценка", type: "SETUP" as const, estimateHours: 4, checklist: ["Состав работ", "Оценка по часам", "Согласовать с клиентом"] },
    { title: "Реализация", type: "WIDGET" as const, estimateHours: 16, checklist: [] },
    { title: "Интеграции с сервисами клиента", type: "INTEGRATION" as const, estimateHours: 6, checklist: [] },
    { title: "Тестирование", type: "OTHER" as const, estimateHours: 4, checklist: ["Проверка по требованиям", "Исправление ошибок"] },
    { title: "Обучение пользователей", type: "TRAINING" as const, estimateHours: 3, checklist: ["Инструкция", "Обучающая встреча"] },
    { title: "Сдача и закрытие", type: "OTHER" as const, estimateHours: 1, checklist: ["Акт", "Обратная связь"] },
  ],
};

export const templateCreateData = () => ({
  name: DEFAULT_TEMPLATE.name,
  columns: DEFAULT_TEMPLATE.columns,
  cards: { create: DEFAULT_TEMPLATE.cards.map((c, i) => ({ ...c, position: i + 1 })) },
});

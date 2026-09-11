export const DAILY_NEW_CARD_LIMIT = 10;

function localDayBounds(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

// 期限超過 → 今日期限 → 新規（上限あり）の順で、今日のセッションを作ります。
export function buildStudyQueue(cards, progressRows, now = new Date(), newCardLimit = DAILY_NEW_CARD_LIMIT) {
  const progressByCardId = new Map(progressRows.map(progress => [progress.cardId, progress]));
  const { start, end } = localDayBounds(now);
  const overdue = [];
  const dueToday = [];
  const newCards = [];
  const learnedNewToday = progressRows.filter(progress => {
    const reviewedAt = progress.lastReviewedAt ? Date.parse(progress.lastReviewedAt) : 0;
    return progress.reviewCount === 1 && reviewedAt >= start && reviewedAt < end;
  }).length;
  const remainingNewCardLimit = Math.max(0, newCardLimit - learnedNewToday);

  cards.forEach(card => {
    const progress = progressByCardId.get(card.id) || null;
    if (!progress || progress.lastReviewedAt === null) {
      newCards.push({ card, progress, category: "new" });
      return;
    }

    const reviewTime = progress.nextReviewAt ? Date.parse(progress.nextReviewAt) : 0;
    const item = { card, progress, category: reviewTime < start ? "overdue" : "due-today" };
    if (reviewTime < start) overdue.push(item);
    else if (reviewTime < end) dueToday.push(item);
  });

  overdue.sort((a, b) => Date.parse(a.progress.nextReviewAt || 0) - Date.parse(b.progress.nextReviewAt || 0));
  dueToday.sort((a, b) => Date.parse(a.progress.nextReviewAt) - Date.parse(b.progress.nextReviewAt));
  newCards.sort((a, b) => Date.parse(a.card.createdAt) - Date.parse(b.card.createdAt));

  return [...overdue, ...dueToday, ...newCards.slice(0, remainingNewCardLimit)];
}

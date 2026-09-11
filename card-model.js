// カード構造の唯一の定義場所です。
// 教材データと学習データはIndexedDBでは別々に保存し、cardIdで関連付けます。

function text(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function dateOrFallback(value, fallback) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeTags(value) {
  const tags = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(tags.filter(tag => typeof tag === "string").map(tag => tag.trim()).filter(Boolean))];
}

export function normalizeMaterialCard(input = {}, fallbackNow = new Date().toISOString()) {
  const createdAt = dateOrFallback(input.createdAt, fallbackNow);
  return {
    id: text(input.id).trim(),
    front: text(input.front).trim(),
    back: text(input.back).trim(),
    example: text(input.example).trim(),
    tags: normalizeTags(input.tags),
    source: text(input.source).trim(),
    createdAt,
    updatedAt: dateOrFallback(input.updatedAt, createdAt)
  };
}

export function createMaterialCard(fields, existingCard = null) {
  const now = new Date().toISOString();
  return normalizeMaterialCard({
    ...fields,
    id: existingCard?.id || crypto.randomUUID(),
    createdAt: existingCard?.createdAt || now,
    updatedAt: now
  }, now);
}

export function normalizeLearningData(input = {}, cardId = input.cardId) {
  return {
    cardId,
    reviewCount: count(input.reviewCount),
    forgotCount: count(input.forgotCount),
    unsureCount: count(input.unsureCount),
    rememberedCount: count(input.rememberedCount),
    lastReviewedAt: dateOrFallback(input.lastReviewedAt, null),
    nextReviewAt: dateOrFallback(input.nextReviewAt, null),
    intervalDays: nonNegativeNumber(input.intervalDays),
    correctStreak: count(input.correctStreak),
    mastered: input.mastered === true
  };
}

export function createDefaultLearningData(cardId) {
  return normalizeLearningData({}, cardId);
}

// 画面表示や将来の完全バックアップで、1枚分をまとめて扱うための形です。
export function combineCardData(material, learning) {
  const { cardId, ...learningFields } = normalizeLearningData(learning, material.id);
  return { ...normalizeMaterialCard(material), ...learningFields };
}

import { normalizeMaterialCard } from "./card-model.js";

export const CARD_IMPORT_SCHEMA_VERSION = 1;
export const CARD_IMPORT_TYPE = "card-import";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function validateCard(card, index, seenIds) {
  const label = `${index + 1}枚目`;
  const errors = [];

  if (!card || typeof card !== "object" || Array.isArray(card)) {
    return [`${label}: カードがオブジェクトではありません。`];
  }
  if (!isNonEmptyString(card.id)) errors.push(`${label}: idが必要です。`);
  else if (seenIds.has(card.id.trim())) errors.push(`${label}: id「${card.id.trim()}」がファイル内で重複しています。`);
  else seenIds.add(card.id.trim());
  if (!isNonEmptyString(card.front)) errors.push(`${label}: frontが必要です。`);
  if (!isNonEmptyString(card.back)) errors.push(`${label}: backが必要です。`);
  if (!isValidDate(card.createdAt)) errors.push(`${label}: createdAtが有効な日時ではありません。`);
  if (!isValidDate(card.updatedAt)) errors.push(`${label}: updatedAtが有効な日時ではありません。`);
  if (card.example !== undefined && typeof card.example !== "string") errors.push(`${label}: exampleは文字列にしてください。`);
  if (card.source !== undefined && typeof card.source !== "string") errors.push(`${label}: sourceは文字列にしてください。`);
  if (card.tags !== undefined && (!Array.isArray(card.tags) || card.tags.some(tag => typeof tag !== "string"))) {
    errors.push(`${label}: tagsは文字列の配列にしてください。`);
  }
  return errors;
}

export function validateCardImportDocument(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["JSONの一番外側はオブジェクトにしてください。"] };
  }
  if (data.schemaVersion !== CARD_IMPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion「${String(data.schemaVersion)}」には対応していません。対応バージョンは1です。`);
  }
  if (data.type !== CARD_IMPORT_TYPE) errors.push("typeは「card-import」にしてください。");
  if (!isValidDate(data.exportedAt)) errors.push("exportedAtが有効な日時ではありません。");
  if (!Array.isArray(data.cards)) errors.push("cardsは配列にしてください。");

  if (Array.isArray(data.cards)) {
    const seenIds = new Set();
    data.cards.forEach((card, index) => errors.push(...validateCard(card, index, seenIds)));
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeCardImportDocument(data) {
  return {
    schemaVersion: CARD_IMPORT_SCHEMA_VERSION,
    type: CARD_IMPORT_TYPE,
    exportedAt: data.exportedAt,
    // normalizeMaterialCardは教材項目だけを返すため、混入した学習項目は採用されません。
    cards: data.cards.map(card => normalizeMaterialCard(card))
  };
}

export function createCardImportDocument(cards, exportedAt = new Date().toISOString()) {
  return normalizeCardImportDocument({ exportedAt, cards });
}

export function compareCardUpdates(existingCard, incomingCard) {
  const existingTime = Date.parse(existingCard.updatedAt);
  const incomingTime = Date.parse(incomingCard.updatedAt);
  if (incomingTime > existingTime) return "update";
  if (incomingTime < existingTime) return "skip";
  return "unchanged";
}

export function planCardImport(existingCard, incomingCard) {
  const incoming = normalizeMaterialCard(incomingCard);
  if (!existingCard) return { action: "add", card: incoming };

  const existing = normalizeMaterialCard(existingCard);
  const action = compareCardUpdates(existing, incoming);
  if (action !== "update") return { action, card: existing };

  return {
    action,
    card: { ...incoming, createdAt: existing.createdAt }
  };
}

import { createDefaultLearningData, normalizeLearningData, normalizeMaterialCard } from "./card-model.js";
import { planCardImport } from "./card-json.js";

const DB_NAME = "my-anki";
const DB_VERSION = 1;
const STORES = { cards: "cards", progress: "progress", reviews: "reviews" };

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("保存処理が中断されました。"));
  });
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.cards)) db.createObjectStore(STORES.cards, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.progress)) db.createObjectStore(STORES.progress, { keyPath: "cardId" });
      if (!db.objectStoreNames.contains(STORES.reviews)) {
        const reviews = db.createObjectStore(STORES.reviews, { keyPath: "id", autoIncrement: true });
        reviews.createIndex("cardId", "cardId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("別のタブで古いMy Ankiが開かれています。"));
  });
}

async function getAll(storeName) {
  const db = await openDatabase();
  const result = await requestResult(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  db.close();
  return result;
}

export const getAllCards = async () => (await getAll(STORES.cards)).map(card => normalizeMaterialCard(card));
export const getAllProgress = async () => (await getAll(STORES.progress)).map(progress => normalizeLearningData(progress));
export const getAllReviews = () => getAll(STORES.reviews);

export async function saveCard(card) {
  const db = await openDatabase();
  const tx = db.transaction([STORES.cards, STORES.progress], "readwrite");
  const normalizedCard = normalizeMaterialCard(card);
  tx.objectStore(STORES.cards).put(normalizedCard);
  const progressStore = tx.objectStore(STORES.progress);
  const existingProgress = await requestResult(progressStore.get(normalizedCard.id));
  if (!existingProgress) progressStore.add(createDefaultLearningData(normalizedCard.id));
  await transactionDone(tx);
  db.close();
}

export async function deleteCard(id) {
  const db = await openDatabase();
  const tx = db.transaction([STORES.cards, STORES.progress, STORES.reviews], "readwrite");
  tx.objectStore(STORES.cards).delete(id);
  tx.objectStore(STORES.progress).delete(id);
  const cursorRequest = tx.objectStore(STORES.reviews).index("cardId").openCursor(IDBKeyRange.only(id));
  cursorRequest.onsuccess = () => { const cursor = cursorRequest.result; if (cursor) { cursor.delete(); cursor.continue(); } };
  await transactionDone(tx);
  db.close();
}

export async function recordReview(cardId, rating, reviewedAt, reviewUpdate) {
  const db = await openDatabase();
  const tx = db.transaction([STORES.progress, STORES.reviews], "readwrite");
  const store = tx.objectStore(STORES.progress);
  const current = await requestResult(store.get(cardId));
  const progress = normalizeLearningData(current, cardId);
  progress.reviewCount += 1;
  progress[`${rating === "forgotten" ? "forgot" : rating}Count`] += 1;
  progress.lastReviewedAt = reviewedAt;
  progress.nextReviewAt = reviewUpdate.nextReviewAt;
  progress.intervalDays = reviewUpdate.intervalDays;
  progress.correctStreak = reviewUpdate.correctStreak;
  progress.mastered = reviewUpdate.mastered;
  store.put(progress);
  tx.objectStore(STORES.reviews).add({
    cardId,
    rating,
    reviewedAt,
    nextReviewAt: reviewUpdate.nextReviewAt,
    intervalDays: reviewUpdate.intervalDays,
    correctStreak: reviewUpdate.correctStreak,
    mastered: reviewUpdate.mastered
  });
  await transactionDone(tx);
  db.close();
}

export async function importCards(cards) {
  const db = await openDatabase();
  const tx = db.transaction([STORES.cards, STORES.progress], "readwrite");
  const store = tx.objectStore(STORES.cards);
  const progressStore = tx.objectStore(STORES.progress);
  const result = { added: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0 };
  try {
    for (const input of cards) {
      const card = normalizeMaterialCard(input);
      const existingRecord = await requestResult(store.get(card.id));
      const existing = existingRecord ? normalizeMaterialCard(existingRecord) : null;
      const plan = planCardImport(existing, card);
      if (plan.action === "add") {
        store.add(plan.card);
        const existingProgress = await requestResult(progressStore.get(card.id));
        if (!existingProgress) progressStore.add(createDefaultLearningData(card.id));
        result.added += 1;
      } else {
        // 再インポートではcreatedAtと学習データを維持し、新しい教材だけを反映します。
        if (plan.action === "update") {
          store.put(plan.card);
          result.updated += 1;
        } else if (plan.action === "skip") result.skipped += 1;
        else result.unchanged += 1;
        const existingProgress = await requestResult(progressStore.get(card.id));
        if (!existingProgress) progressStore.add(createDefaultLearningData(card.id));
      }
    }
    await transactionDone(tx);
    db.close();
    return result;
  } catch (error) {
    try { tx.abort(); } catch (_) { /* transaction is already closed */ }
    db.close();
    throw error;
  }
}

export async function seedCards(cards) {
  if ((await getAllCards()).length === 0) await importCards(cards);
}

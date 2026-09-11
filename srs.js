const RATINGS = ["forgotten", "unsure", "remembered"];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function roundedDays(value) {
  return Math.max(1, Math.round(value));
}

// UIやIndexedDBから独立したMVP用SRSです。FSRSへ移行するときは、この関数を差し替えます。
export function calculateReviewUpdate(progress, rating, reviewedAt = new Date()) {
  if (!RATINGS.includes(rating)) throw new Error("不明な評価です。");

  const currentInterval = Number(progress?.intervalDays) || 0;
  const isFirstReview = !progress?.reviewCount || currentInterval === 0;
  let intervalDays;

  if (rating === "forgotten") intervalDays = 1;
  else if (rating === "unsure") intervalDays = isFirstReview ? 3 : roundedDays(currentInterval * 1.3);
  else intervalDays = isFirstReview ? 7 : roundedDays(currentInterval * 2.2);

  const correctStreak = rating === "remembered" ? (progress?.correctStreak || 0) + 1 : 0;
  const mastered = rating === "remembered" && correctStreak >= 5;
  const nextReviewAt = new Date(reviewedAt.getTime() + intervalDays * DAY_IN_MS).toISOString();

  return { intervalDays, correctStreak, mastered, nextReviewAt };
}

// 旧コードから呼びやすい補助関数。新規カードとして次回日時だけを返します。
export function calculateNextReviewAt(rating, reviewedAt = new Date()) {
  return calculateReviewUpdate(null, rating, reviewedAt).nextReviewAt;
}

import { deleteCard, getAllCards, getAllProgress, getAllReviews, importCards, recordReview, saveCard, seedCards } from "./db.js";
import { calculateReviewUpdate } from "./srs.js";
import { createMaterialCard } from "./card-model.js";
import { createCardImportDocument, normalizeCardImportDocument, validateCardImportDocument } from "./card-json.js";
import { buildStudyQueue } from "./study-session.js";

const SAMPLE_CARDS = [
  { id: "b592e3f0-f307-4f33-98ef-3a57e40e28d1", front: "prospective", back: "将来の、見込みの", example: "She is a prospective student.", tags: ["sample"], source: "My Anki sample", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" },
  { id: "18108d4c-2dde-44e5-9871-b3716aa86092", front: "essential", back: "必要不可欠な、本質的な", example: "Sleep is essential for good health.", tags: ["sample"], source: "My Anki sample", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" },
  { id: "a51079e4-f9e1-445a-8942-cf9676957388", front: "generous", back: "寛大な、気前のよい", example: "That was very generous of you.", tags: ["sample"], source: "My Anki sample", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
let studyQueue = [];
let currentStudyItem = null;

function showMessage(text, isError = false) {
  const message = $("#message");
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.hidden = false;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { message.hidden = true; }, 5000);
}

function downloadJson(data, prefix) {
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${date}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function todayStudyItems() {
  const [cards, progressRows] = await Promise.all([getAllCards(), getAllProgress()]);
  return buildStudyQueue(cards, progressRows);
}

async function refreshHome() {
  $("#due-count").textContent = (await todayStudyItems()).length;
}

async function showScreen(name) {
  $$(".screen").forEach(screen => screen.classList.toggle("active", screen.id === `${name}-screen`));
  $$("nav [data-screen]").forEach(button => button.classList.toggle("active", button.dataset.screen === name));
  if (name === "home") await refreshHome();
  if (name === "manage") await renderCardList();
  if (name === "study") await startStudy();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function startStudy() {
  studyQueue = await todayStudyItems();
  showNextStudyCard();
}

function showNextStudyCard() {
  currentStudyItem = studyQueue.shift() || null;
  $("#remaining-count").textContent = currentStudyItem ? studyQueue.length + 1 : 0;
  $("#study-empty").hidden = Boolean(currentStudyItem);
  $("#study-area").hidden = !currentStudyItem;
  if (!currentStudyItem) return;
  $("#card-front").textContent = currentStudyItem.card.front;
  $("#card-back").textContent = currentStudyItem.card.back;
  $("#card-example").textContent = currentStudyItem.card.example || "";
  $("#card-answer").hidden = true;
  $("#rating-buttons").hidden = true;
  $("#show-answer").hidden = false;
}

function revealAnswer() {
  if (!currentStudyItem) return;
  $("#card-answer").hidden = false;
  $("#show-answer").hidden = true;
  $("#rating-buttons").hidden = false;
}

async function rateCard(rating) {
  if (!currentStudyItem) return;
  const buttons = $$(".rating-button");
  buttons.forEach(button => { button.disabled = true; });
  try {
    const reviewedAt = new Date();
    const reviewUpdate = calculateReviewUpdate(currentStudyItem.progress, rating, reviewedAt);
    await recordReview(currentStudyItem.card.id, rating, reviewedAt.toISOString(), reviewUpdate);
    showNextStudyCard();
    await refreshHome();
  } catch (error) {
    console.error(error);
    showMessage("学習結果を保存できませんでした。もう一度お試しください。", true);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function resetForm() {
  $("#card-form").reset();
  $("#card-id").value = "";
  $("#form-title").textContent = "新しいカード";
  $("#cancel-edit").hidden = true;
}

function tagsFromInput(value) {
  return [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))];
}

async function submitCard(event) {
  event.preventDefault();
  const id = $("#card-id").value;
  const existing = id ? (await getAllCards()).find(card => card.id === id) : null;
  const card = createMaterialCard({
    front: $("#front").value.trim(),
    back: $("#back").value.trim(),
    example: $("#example").value.trim(),
    tags: tagsFromInput($("#tags").value),
    source: $("#source").value.trim()
  }, existing);
  try {
    await saveCard(card);
    resetForm();
    await renderCardList();
    showMessage(existing ? "カードを更新しました。" : "カードを追加しました。");
  } catch (error) {
    console.error(error);
    showMessage("カードを保存できませんでした。", true);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

async function renderCardList() {
  const [cards, progressRows] = await Promise.all([getAllCards(), getAllProgress()]);
  const progressByCardId = new Map(progressRows.map(progress => [progress.cardId, progress]));
  const filter = $("#card-filter").value;
  const visibleCards = filter === "mastered" ? cards.filter(card => progressByCardId.get(card.id)?.mastered) : cards;
  const list = $("#card-list");
  if (!visibleCards.length) { list.innerHTML = `<p>${filter === "mastered" ? "定着済みのカードはありません。" : "カードはまだありません。"}</p>`; return; }
  list.innerHTML = visibleCards.map(card => {
    const isMastered = progressByCardId.get(card.id)?.mastered;
    return `<article class="list-card" data-id="${escapeHtml(card.id)}"><h3>${escapeHtml(card.front)} ${isMastered ? '<span class="mastered-badge">定着済み</span>' : ""}</h3><p>${escapeHtml(card.back)}</p>${card.source ? `<p>Source: ${escapeHtml(card.source)}</p>` : ""}<div>${card.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div><div class="card-actions"><button class="text-button edit-card" type="button">編集</button><button class="text-button danger delete-card" type="button">削除</button></div></article>`;
  }).join("");
}

async function handleCardList(event) {
  const article = event.target.closest(".list-card");
  if (!article) return;
  const card = (await getAllCards()).find(item => item.id === article.dataset.id);
  if (event.target.closest(".edit-card")) {
    $("#card-id").value = card.id; $("#front").value = card.front; $("#back").value = card.back;
    $("#example").value = card.example; $("#tags").value = card.tags.join(", "); $("#source").value = card.source;
    $("#form-title").textContent = "カードを編集"; $("#cancel-edit").hidden = false; $("#front").focus();
  }
  if (event.target.closest(".delete-card") && confirm(`「${card.front}」を削除しますか？\n学習履歴も削除されます。`)) {
    try { await deleteCard(card.id); await renderCardList(); await refreshHome(); showMessage("カードを削除しました。"); }
    catch (error) { console.error(error); showMessage("カードを削除できませんでした。", true); }
  }
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const resultArea = $("#import-result");
  try {
    const data = JSON.parse(await file.text());
    const validation = validateCardImportDocument(data);
    if (!validation.valid) {
      resultArea.innerHTML = `<strong>インポートしませんでした</strong><br>${validation.errors.map(escapeHtml).join("<br>")}<br>エラー: ${validation.errors.length}件`;
      return;
    }
    const document = normalizeCardImportDocument(data);
    const result = await importCards(document.cards);
    resultArea.innerHTML = `<strong>インポート完了</strong><br>新規追加: ${result.added}枚<br>更新: ${result.updated}枚<br>変更なし: ${result.unchanged}枚<br>スキップ: ${result.skipped}枚<br>エラー: ${result.errors}枚`;
    await refreshHome();
  } catch (error) {
    console.error(error);
    resultArea.textContent = "JSONを読み込めませんでした。ファイルの内容を確認してください。データは変更されていません。";
  } finally { event.target.value = ""; }
}

async function exportCards() {
  downloadJson(createCardImportDocument(await getAllCards()), "my-anki-cards");
}

async function exportBackup() {
  const [cards, progress, reviews] = await Promise.all([getAllCards(), getAllProgress(), getAllReviews()]);
  downloadJson({ schemaVersion: 1, type: "full-backup", exportedAt: new Date().toISOString(), cards, progress, reviews }, "my-anki-backup");
}

function bindEvents() {
  $$('[data-screen]').forEach(button => button.addEventListener("click", () => showScreen(button.dataset.screen).catch(handleFatalError)));
  $("#start-study").addEventListener("click", () => showScreen("study").catch(handleFatalError));
  $("#word-card").addEventListener("click", revealAnswer);
  $("#show-answer").addEventListener("click", revealAnswer);
  $$(".rating-button").forEach(button => button.addEventListener("click", () => rateCard(button.dataset.rating)));
  $("#card-form").addEventListener("submit", submitCard);
  $("#cancel-edit").addEventListener("click", resetForm);
  $("#card-list").addEventListener("click", handleCardList);
  $("#card-filter").addEventListener("change", () => renderCardList().catch(handleFatalError));
  $("#export-cards").addEventListener("click", () => exportCards().catch(handleFatalError));
  $("#backup-button").addEventListener("click", () => exportBackup().catch(handleFatalError));
  $("#import-file").addEventListener("change", handleImport);
}

function handleFatalError(error) {
  console.error(error);
  showMessage("データを読み込めませんでした。Safariの設定を確認して、ページを再読み込みしてください。", true);
}

async function initialize() {
  bindEvents();
  try {
    await seedCards(SAMPLE_CARDS);
    await refreshHome();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  } catch (error) { handleFatalError(error); }
}

initialize();

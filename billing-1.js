// =============================================================================
// billing.js — Module PAIEMENT, fusionné depuis l'application de paiement
// existante de Seyda Zeynab Academy. Logique portée fidèlement (cycles
// mensuels, pauses, familles), adaptée à notre stockage IndexedDB et à
// notre système multi-élèves. Le système pédagogique (niveaux, diplômes)
// de l'ancienne application n'est PAS repris — seul le module financier
// (facturation, paiements, reçus, familles) est intégré ici.
// =============================================================================

function newBillingSkeleton(studentId) {
  return {
    studentId,
    mode: "individual", // "individual" | "family"
    familyId: null,
    amount: 0,
    currency: (STATE.settings.payment?.currencies || ["FCFA"])[0],
    dueDay: 5,
    startDate: todayISO(),
    payments: [],   // {id, date, time, amount, currency, method, comment, coversMonth, receiptNumber}
    history: [],    // {date, field, oldValue, newValue}
    pausedMonths: [], // ["2026-08", ...]
    pause: { active: false, startDate: null, endDate: null },
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtMoneyDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(STATE.settings.language === "en" ? "en-GB" : STATE.settings.language === "it" ? "it-IT" : "fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ---- Cycles de facturation (mensuels), pauses, statut ----
function periodKeyOf(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}
function firstDueDate(startISO, dueDay) {
  // La première échéance tombe toujours dans le MOIS d'inscription/de mise
  // en place de la facturation (même si le jour choisi est déjà passé ce
  // mois-ci) — sinon un paiement enregistré immédiatement après avoir
  // configuré la facturation n'a aucun cycle à satisfaire et reste "en
  // attente" jusqu'au mois suivant, ce qui n'est pas ce qu'on attend.
  const start = new Date(startISO + "T00:00:00");
  return new Date(start.getFullYear(), start.getMonth(), dueDay);
}
function isCycleInPause(entity, date) {
  const p = entity.pause;
  if (!p || !p.active) return false;
  const start = p.startDate ? new Date(p.startDate + "T00:00:00") : null;
  const end = p.endDate ? new Date(p.endDate + "T23:59:59") : null;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

// entity : { amount, currency, dueDay, startDate, payments[], pausedMonths[], pause{} }
function computeBillingStatus(entity) {
  const today = new Date();
  const amount = Number(entity.amount) || 0;
  const pausedMonths = entity.pausedMonths || [];
  let due = firstDueDate(entity.startDate, entity.dueDay || 1);
  const cycles = [];
  let guard = 0;
  while (due <= today && guard < 600) {
    const pk = periodKeyOf(due);
    const paused = isCycleInPause(entity, due) || pausedMonths.includes(pk);
    const paidAmt = entity.payments.filter((p) => p.coversMonth === pk).reduce((a, p) => a + Number(p.amount || 0), 0);
    const fullyPaid = paused ? true : amount > 0 ? paidAmt >= amount : paidAmt > 0;
    cycles.push({ periodKey: pk, dueDate: new Date(due), paidAmount: paidAmt, fullyPaid, paused });
    due = new Date(due.getFullYear(), due.getMonth() + 1, entity.dueDay || 1);
    guard++;
  }
  const nextDueDate = due;
  const currentCycle = cycles.length ? cycles[cycles.length - 1] : null;
  let status = "pending", daysLate = 0;
  if (currentCycle) {
    if (currentCycle.paused) status = "paused";
    else if (currentCycle.fullyPaid) status = "paid";
    else if (currentCycle.paidAmount > 0) { status = "partial"; daysLate = Math.max(0, Math.floor((today - currentCycle.dueDate) / 86400000)); }
    else { status = "unpaid"; daysLate = Math.max(0, Math.floor((today - currentCycle.dueDate) / 86400000)); }
  }
  if (entity.pause && entity.pause.active) {
    const start = entity.pause.startDate ? new Date(entity.pause.startDate + "T00:00:00") : null;
    const end = entity.pause.endDate ? new Date(entity.pause.endDate + "T23:59:59") : null;
    const coversToday = (!start || today >= start) && (!end || today <= end);
    if (coversToday) { status = "paused"; daysLate = 0; }
  }
  const monthsPaid = cycles.filter((c) => c.fullyPaid && !c.paused).length;
  const monthsUnpaid = cycles.filter((c) => !c.fullyPaid && !c.paused).length;
  const monthsPaused = cycles.filter((c) => c.paused).length;
  const totalPaid = entity.payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const totalDue = cycles.filter((c) => !c.paused).length * amount;
  const lastPayment = entity.payments.slice().sort((a, b) => (a.date + (a.time || "") < b.date + (b.time || "") ? 1 : -1))[0] || null;
  return { status, cycles, monthsPaid, monthsUnpaid, monthsPaused, daysLate, nextDueDate, currentCycle, totalPaid, totalDue, lastPayment };
}

const BILLING_STATUS_LABELS = {
  fr: { paid: "À jour", partial: "Partiel", unpaid: "Impayé", paused: "En pause", pending: "En attente" },
  en: { paid: "Up to date", partial: "Partial", unpaid: "Unpaid", paused: "Paused", pending: "Pending" },
  it: { paid: "In regola", partial: "Parziale", unpaid: "Non pagato", paused: "In pausa", pending: "In attesa" },
};
function billingStatusLabel(status) {
  const lang = STATE.settings.language || "fr";
  return (BILLING_STATUS_LABELS[lang] || BILLING_STATUS_LABELS.fr)[status] || status;
}

// ---- Pause / vacances ----
function addPauseMonth(entity, periodKey) {
  entity.pausedMonths = entity.pausedMonths || [];
  if (!entity.pausedMonths.includes(periodKey)) {
    entity.pausedMonths.push(periodKey);
    entity.history.push({ date: todayISO(), field: "pause", oldValue: "—", newValue: `Pause ajoutée : ${periodKey}` });
  }
}
function removePauseMonth(entity, periodKey) {
  entity.pausedMonths = (entity.pausedMonths || []).filter((k) => k !== periodKey);
  entity.history.push({ date: todayISO(), field: "pause", oldValue: `Pause retirée : ${periodKey}`, newValue: "—" });
}
function activatePause(entity, startDate, endDate) {
  entity.pause = entity.pause || {};
  entity.pause.active = true;
  entity.pause.startDate = startDate || todayISO();
  entity.pause.endDate = endDate || null;
  entity.history.push({
    date: todayISO(), field: "pause", oldValue: "—",
    newValue: `Pause activée du ${fmtMoneyDate(entity.pause.startDate)}${entity.pause.endDate ? " au " + fmtMoneyDate(entity.pause.endDate) : " (durée indéterminée)"}`,
  });
}
function deactivatePause(entity) {
  const wasRange = entity.pause && entity.pause.active
    ? fmtMoneyDate(entity.pause.startDate) + (entity.pause.endDate ? " au " + fmtMoneyDate(entity.pause.endDate) : " (indéterminée)")
    : "—";
  entity.pause = entity.pause || {};
  entity.pause.active = false;
  entity.history.push({ date: todayISO(), field: "pause", oldValue: `Pause : ${wasRange}`, newValue: "Cours repris" });
}

// ---- Paiements ----
function generateReceiptNumber(entityRefId) {
  return "REC-" + (entityRefId || "").toString().slice(-4).toUpperCase() + "-" + Date.now().toString(36).slice(-5).toUpperCase();
}
function recordPayment(entity, entityRefId, data) {
  const receiptNumber = generateReceiptNumber(entityRefId);
  const payment = {
    id: newId("pay"),
    date: data.date || todayISO(),
    time: data.time || new Date().toTimeString().slice(0, 5),
    amount: Number(data.amount) || 0,
    currency: data.currency || entity.currency,
    method: data.method || "",
    comment: data.comment || "",
    coversMonth: data.coversMonth || periodKeyOf(new Date()),
    receiptNumber,
  };
  entity.payments.push(payment);
  return payment;
}

// ---- Entités de facturation (élève individuel OU famille) ----
// Unifie élèves individuels et familles sous une même forme pour la liste
// Paiements et les calculs de statut.
async function loadAllBillingEntities() {
  const allBilling = await DB.getAllBilling();
  const allFamilies = await DB.getAllFamilies();
  const billingByStudent = Object.fromEntries(allBilling.map((b) => [b.studentId, b]));

  const entities = [];
  allFamilies.forEach((fam) => {
    const members = (fam.memberIds || []).map((id) => STATE.students.find((s) => s.id === id)).filter(Boolean);
    entities.push({
      kind: "family", id: `f_${fam.id}`, refId: fam.id,
      name: fam.name, members,
      amount: fam.amount, currency: fam.currency, dueDay: fam.dueDay, startDate: fam.startDate,
      payments: fam.payments || [], history: fam.history || [],
      pausedMonths: fam.pausedMonths || [], pause: fam.pause || { active: false },
    });
  });
  STATE.students.forEach((s) => {
    const b = billingByStudent[s.id];
    if (!b || b.mode === "family") return; // facturé via une famille, pas individuellement
    entities.push({
      kind: "individual", id: `s_${s.id}`, refId: s.id,
      name: s.fullName, members: [s],
      amount: b.amount, currency: b.currency, dueDay: b.dueDay, startDate: b.startDate,
      payments: b.payments || [], history: b.history || [],
      pausedMonths: b.pausedMonths || [], pause: b.pause || { active: false },
    });
  });
  return entities;
}

async function saveEntityBilling(entity) {
  if (entity.kind === "family") {
    const fam = await DB.getFamily(entity.refId);
    if (!fam) return;
    fam.amount = entity.amount; fam.currency = entity.currency; fam.dueDay = entity.dueDay; fam.startDate = entity.startDate;
    fam.payments = entity.payments; fam.history = entity.history;
    fam.pausedMonths = entity.pausedMonths; fam.pause = entity.pause;
    await DB.saveFamily(fam);
  } else {
    const b = (await DB.getBilling(entity.refId)) || newBillingSkeleton(entity.refId);
    b.amount = entity.amount; b.currency = entity.currency; b.dueDay = entity.dueDay; b.startDate = entity.startDate;
    b.payments = entity.payments; b.history = entity.history;
    b.pausedMonths = entity.pausedMonths; b.pause = entity.pause;
    await DB.saveBilling(entity.refId, b);
  }
}

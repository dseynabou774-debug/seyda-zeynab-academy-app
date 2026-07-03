// =============================================================================
// diploma.js — Génération automatique des diplômes en PDF (FR / EN / IT)
// Utilise jsPDF (chargé depuis un CDN dans index.html, mis en cache par le
// service worker pour un fonctionnement hors ligne après le premier chargement).
// =============================================================================

function generateCertNumber() {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SZA-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`;
}

const DIPLOMA_LABELS = {
  fr: { title: "DIPLÔME", of: "décerné à", forLevel: "pour la validation du niveau" },
  en: { title: "DIPLOMA", of: "awarded to", forLevel: "for successfully completing the level" },
  it: { title: "DIPLOMA", of: "rilasciato a", forLevel: "per il completamento del livello" },
};

/**
 * Construit le PDF du diplôme et retourne { blob, dataUrl }.
 * @param {object} opts { studentName, levelTitle, lang, certNumber, issuedAt }
 */
async function buildDiplomaPdf(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const labels = DIPLOMA_LABELS[opts.lang] || DIPLOMA_LABELS.fr;

  const emerald = [14, 99, 85];
  const gold = [200, 155, 60];
  const ink = [27, 43, 41];

  // Fond
  doc.setFillColor(250, 246, 238);
  doc.rect(0, 0, W, H, "F");

  // Cadre double
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.rect(6, 6, W - 12, H - 12);
  doc.setLineWidth(0.4);
  doc.rect(9, 9, W - 18, H - 18);

  // En-tête
  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 20, { align: "center" });

  doc.setTextColor(...gold);
  doc.setFontSize(22);
  doc.text(labels.title, W / 2, 32, { align: "center" });

  doc.setTextColor(...ink);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text(labels.of, W / 2, 42, { align: "center" });

  doc.setFont("times", "bolditalic");
  doc.setFontSize(19);
  doc.setTextColor(...emerald);
  doc.text(opts.studentName, W / 2, 52, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text(`${labels.forLevel} :`, W / 2, 61, { align: "center" });
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text(opts.levelTitle, W / 2, 68, { align: "center" });

  // Message d'encouragement
  doc.setFont("times", "italic");
  doc.setFontSize(9.5);
  const msg = t("encourage", opts.studentName.split(" ")[0] || opts.studentName);
  const msgLines = doc.splitTextToSize(msg, W - 40);
  doc.text(msgLines, W / 2, 78, { align: "center" });

  // Pied de page : date, signature, numéro
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.text(`${t("deliveredOn")} : ${opts.issuedAtLabel}`, 20, H - 16);
  doc.text(t("signature"), W - 20, H - 16, { align: "right" });

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 110);
  doc.text(`${t("certNumber")} : ${opts.certNumber}`, W / 2, H - 9, { align: "center" });

  const blob = doc.output("blob");
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

/**
 * Crée (ou régénère) un diplôme pour un niveau validé, l'enregistre en base
 * et retourne l'enregistrement complet.
 */
async function createDiplomaForLevel(level, lang) {
  const student = await DB.getStudent();
  const studentName = student?.fullName || "—";
  const certNumber = generateCertNumber();
  const issuedAt = Date.now();
  const issuedAtLabel = new Date(issuedAt).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );
  const levelTitleStr = levelTitle(level);

  const { dataUrl } = await buildDiplomaPdf({
    studentName, levelTitle: levelTitleStr, lang, certNumber, issuedAtLabel,
  });

  const diploma = {
    id: certNumber,
    levelId: level.id,
    levelTitle: levelTitleStr,
    lang,
    studentName,
    certNumber,
    issuedAt,
    pdfDataUrl: dataUrl,
  };
  await DB.saveDiploma(diploma);
  return diploma;
}

function downloadDiploma(diploma) {
  const a = document.createElement("a");
  a.href = diploma.pdfDataUrl;
  a.download = `Diplome_${diploma.levelId}_${diploma.certNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function shareDiploma(diploma) {
  try {
    const res = await fetch(diploma.pdfDataUrl);
    const blob = await res.blob();
    const file = new File([blob], `Diplome_${diploma.certNumber}.pdf`, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: diploma.levelTitle });
      return true;
    }
  } catch (e) { /* fall through to download */ }
  downloadDiploma(diploma);
  return false;
}

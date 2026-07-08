// =============================================================================
// receipt.js — Génération des reçus de paiement (PNG + PDF + partage),
// portée fidèlement depuis l'application de paiement existante (même
// design : bordure dorée, encadré émeraude, citation, signature, motif de
// vérification). Le PDF est produit via jsPDF (déjà utilisé par l'app pour
// les diplômes) plutôt que par le générateur de PDF "à la main" de
// l'application d'origine — même résultat visuel, code plus simple à
// maintenir puisqu'on ne dépend plus que d'une seule bibliothèque PDF.
// =============================================================================

const RECEIPT_TXT = {
  fr: { title: "REÇU", title2: "DE PAIEMENT", name: "Nom de l'élève", nameFamily: "Nom de la famille", amountPaid: "Montant payé", words: "En lettres", purpose: "Pour", method: "Mode de paiement", paymentDate: "Date de paiement", date: "Date", receiptNo: "N° reçu", purposeText: "Cours coranique en ligne", purposeTextFamily: "Cours coranique en ligne (cours familial)" },
  en: { title: "RECEIPT", title2: "OF PAYMENT", name: "Student's name", nameFamily: "Family name", amountPaid: "Amount paid", words: "In words", purpose: "For", method: "Payment method", paymentDate: "Payment date", date: "Date", receiptNo: "Receipt No.", purposeText: "Online Quran lessons", purposeTextFamily: "Online Quran lessons (family course)" },
  it: { title: "RICEVUTA", title2: "DI PAGAMENTO", name: "Nome dell'alunna", nameFamily: "Nome della famiglia", amountPaid: "Importo pagato", words: "In lettere", purpose: "Per", method: "Metodo di pagamento", paymentDate: "Data di pagamento", date: "Data", receiptNo: "Ricevuta n.", purposeText: "Corso di Corano online", purposeTextFamily: "Corso di Corano online (corso famiglia)" },
};

// ---- Montant en toutes lettres (français, convention administrative) ----
function numberToFrenchWords(n) {
  n = Math.round(n);
  if (n === 0) return "zéro";
  const units = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const tensNames = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
  function twoDigits(num) {
    if (num < 20) return units[num];
    const t = Math.floor(num / 10), u = num % 10;
    if (t === 7 || t === 9) {
      if (t === 7 && u === 1) return "soixante et onze";
      return tensNames[t] + "-" + units[10 + u];
    }
    let str = tensNames[t];
    if (u === 1 && t >= 2 && t <= 6) str += " et un";
    else if (u > 0) str += "-" + units[u];
    if (t === 8 && u === 0) str += "s";
    return str;
  }
  function threeDigits(num) {
    const c = Math.floor(num / 100), rest = num % 100;
    let str = "";
    if (c > 0) { str += c > 1 ? units[c] + " cent" : "cent"; if (c > 1 && rest === 0) str += "s"; if (rest > 0) str += " "; }
    if (rest > 0) str += twoDigits(rest);
    return str;
  }
  const million = Math.floor(n / 1000000);
  const thousand = Math.floor((n % 1000000) / 1000);
  const rem = n % 1000;
  let parts = [];
  if (million > 0) parts.push(million > 1 ? threeDigits(million) + " millions" : "un million");
  if (thousand > 0) parts.push(thousand > 1 ? threeDigits(thousand) + " mille" : "mille");
  if (rem > 0) parts.push(threeDigits(rem));
  return parts.join(" ").trim();
}
const CURRENCY_WORDS_FR = { FCFA: "francs CFA", XOF: "francs CFA", XAF: "francs CFA", USD: "dollars", EUR: "euros", GBP: "livres sterling", MAD: "dirhams" };
function amountInWordsFR(amount, currency) {
  const words = numberToFrenchWords(amount);
  const curWord = CURRENCY_WORDS_FR[currency] || currency;
  return words.charAt(0).toUpperCase() + words.slice(1) + " " + curWord;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  const lines = [];
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && line !== "") { lines.push(line.trim()); line = words[i] + " "; }
    else line = test;
  }
  lines.push(line.trim());
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}
function drawVerificationPattern(ctx, x, y, size, seedStr) {
  const cells = 9;
  const cs = size / cells;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967295; }
  ctx.save();
  ctx.fillStyle = "#fff"; ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  ctx.fillStyle = "#12281f";
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const isFinder = (r < 3 && c < 3) || (r < 3 && c > cells - 4) || (r > cells - 4 && c < 3);
      if (isFinder) { if (r % 3 !== 1 || c % 3 !== 1) ctx.fillRect(x + c * cs, y + r * cs, cs, cs); }
      else if (rnd() > 0.52) ctx.fillRect(x + c * cs, y + r * cs, cs, cs);
    }
  }
  ctx.restore();
}

let _receiptLogoImg = null, _receiptSignatureImg = null;
function loadReceiptImages() {
  return Promise.all([
    new Promise((resolve) => {
      if (_receiptLogoImg) return resolve(_receiptLogoImg);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "logo-official.png";
      _receiptLogoImg = img;
    }),
    new Promise((resolve) => {
      if (_receiptSignatureImg) return resolve(_receiptSignatureImg);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "signature-teacher.png";
      _receiptSignatureImg = img;
    }),
  ]);
}

/**
 * Dessine le reçu sur un canvas (créé en mémoire) et retourne ce canvas.
 * entity : { kind, name, members } — élève individuel ou famille
 * payment : { amount, currency, method, date, receiptNumber, coversMonth }
 */
async function drawReceiptCanvas(entity, payment, lang) {
  const [logoImg, signatureImg] = await loadReceiptImages();
  const verifyUrl = buildVerifyUrl({
    type: "receipt", num: payment.receiptNumber, name: entity.name,
    amount: payment.amount, currency: payment.currency, date: payment.date,
    coversMonth: payment.coversMonth, lang,
  });
  const qrDataUrl = await getQrDataUrl(verifyUrl);
  const qrImg = qrDataUrl ? await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = qrDataUrl;
  }) : null;
  const canvas = document.createElement("canvas");
  canvas.width = 1000; canvas.height = 1550;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const T = RECEIPT_TXT[lang] || RECEIPT_TXT.fr;
  const ps = STATE.settings.payment || {};
  const academyName = ps.academyName || "Seyda Zeynab Academy";

  ctx.fillStyle = "#FBF6E8";
  ctx.fillRect(0, 0, W, H);

  ctx.lineWidth = 6; ctx.strokeStyle = "#C9A227";
  roundRectPath(ctx, 22, 22, W - 44, H - 44, 28);
  ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = "#0B6E4F";
  roundRectPath(ctx, 34, 34, W - 68, H - 68, 20);
  ctx.stroke();

  if (logoImg) {
    const logoCx = 175, logoCy = 195, logoR = 108;
    ctx.save();
    ctx.beginPath(); ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.drawImage(logoImg, logoCx - logoR, logoCy - logoR, logoR * 2, logoR * 2);
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = "#C9A227";
    ctx.beginPath(); ctx.arc(logoCx, logoCy, logoR, 0, Math.PI * 2); ctx.stroke();
  }

  const headRightX = W - 70;
  ctx.textAlign = "right";
  ctx.fillStyle = "#0B6E4F";
  ctx.font = "bold 60px Georgia, serif";
  ctx.fillText(T.title, headRightX, 145);
  ctx.fillStyle = "#C9A227";
  ctx.font = "bold 28px Georgia, serif";
  ctx.fillText(T.title2, headRightX, 188);
  ctx.font = "20px Georgia, serif";
  ctx.fillText("✦", headRightX, 218);

  const pillW = 380, pillH = 46, pillX = headRightX - pillW, pillY = 244;
  ctx.fillStyle = "#0B3B2C";
  roundRectPath(ctx, pillX, pillY, pillW, pillH, 23);
  ctx.fill();
  ctx.fillStyle = "#F8F3E3";
  ctx.font = "bold 16px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText(T.receiptNo + " :", pillX + 22, pillY + 29);
  ctx.font = "15px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillText(payment.receiptNumber, pillX + pillW - 22, pillY + 29);

  ctx.fillStyle = "#0B6E4F"; ctx.font = "bold 15px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText(T.date.toUpperCase() + " :", pillX, pillY + 82);
  ctx.fillStyle = "#12281f"; ctx.font = "15px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillText(fmtMoneyDate(payment.date), pillX + pillW, pillY + 82);

  const dividerY = 372;
  ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(70, dividerY); ctx.lineTo(W / 2 - 26, dividerY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W / 2 + 26, dividerY); ctx.lineTo(W - 70, dividerY); ctx.stroke();
  ctx.font = "20px Georgia, serif"; ctx.fillStyle = "#C9A227"; ctx.textAlign = "center";
  ctx.fillText("❖", W / 2, dividerY + 7);

  const nameLabel = entity.kind === "family" ? T.nameFamily : T.name;
  const purposeText = entity.kind === "family" ? T.purposeTextFamily : T.purposeText;
  const amountWordsStr = amountInWordsFR(payment.amount, payment.currency);

  let fy = 440;
  function fieldRow(label, value, opts) {
    opts = opts || {};
    ctx.textAlign = "left";
    ctx.font = "bold 14px Georgia, serif"; ctx.fillStyle = "#0B6E4F";
    ctx.fillText(label.toUpperCase() + " :", 70, fy);
    ctx.font = opts.font || "20px Georgia, serif";
    ctx.fillStyle = opts.color || "#12281f";
    ctx.fillText(value, 300, fy + 26);
    ctx.strokeStyle = "#D8CDA8"; ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(300, fy + 36); ctx.lineTo(W - 70, fy + 36); ctx.stroke();
    ctx.setLineDash([]);
    fy += opts.gap || 78;
  }

  fieldRow(nameLabel, entity.name);

  ctx.textAlign = "left";
  ctx.font = "bold 14px Georgia, serif"; ctx.fillStyle = "#0B6E4F";
  ctx.fillText(T.amountPaid.toUpperCase() + " :", 70, fy);
  const boxW = 340, boxH = 58, boxX = 300, boxY = fy + 8;
  ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 2;
  roundRectPath(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.stroke();
  ctx.font = "bold 32px Georgia, serif"; ctx.fillStyle = "#C9A227";
  ctx.textAlign = "center";
  ctx.fillText(payment.amount + " " + payment.currency, boxX + boxW / 2, boxY + 38);
  fy += 96;

  fieldRow(T.words, amountWordsStr, { font: "17px Georgia, serif", gap: 78 });
  fieldRow(T.purpose, purposeText, { gap: 78 });
  fieldRow(T.method, payment.method || "—", { gap: 78 });
  fieldRow(T.paymentDate, fmtMoneyDate(payment.date), { gap: 96 });

  const quote = ps.receiptQuote || "";
  const quoteAuthor = ps.receiptQuoteAuthor || "";
  if (quote) {
    ctx.font = "italic 18px Georgia, serif";
    const qLineCount = Math.ceil(ctx.measureText(quote).width / (W - 280)) || 1;
    const qBoxH = 70 + qLineCount * 28 + (quoteAuthor ? 30 : 0);
    const qBoxY = fy;
    ctx.strokeStyle = "#C9A227"; ctx.lineWidth = 1.5;
    roundRectPath(ctx, 70, qBoxY, W - 140, qBoxH, 14);
    ctx.stroke();
    ctx.font = "36px Georgia, serif"; ctx.fillStyle = "#C9A227"; ctx.textAlign = "left";
    ctx.fillText("\u201C", 92, qBoxY + 52);
    ctx.font = "italic 18px Georgia, serif"; ctx.fillStyle = "#12281f";
    ctx.textAlign = "center";
    const nLines = wrapCanvasText(ctx, quote, W / 2, qBoxY + 56, W - 260, 27);
    if (quoteAuthor) {
      ctx.font = "15px Georgia, serif"; ctx.fillStyle = "#6B7469";
      ctx.fillText("— " + quoteAuthor, W / 2, qBoxY + 56 + nLines * 27 + 16);
    }
    fy = qBoxY + qBoxH + 46;
  } else {
    fy += 20;
  }

  ctx.textAlign = "center";
  if (ps.receiptThanks) {
    ctx.font = "bold 19px Georgia, serif"; ctx.fillStyle = "#0B6E4F";
    ctx.fillText(ps.receiptThanks, W / 2, fy);
    fy += 32;
  }
  if (ps.receiptWish) {
    ctx.font = "15px Georgia, serif"; ctx.fillStyle = "#6B7469";
    const wishLines = wrapCanvasText(ctx, ps.receiptWish, W / 2, fy, W - 220, 22);
    fy += wishLines * 22 + 20;
  }

  const bottomY = Math.max(fy + 30, H - 230);
  let cy = bottomY;
  ctx.textAlign = "left"; ctx.font = "15px Georgia, serif"; ctx.fillStyle = "#12281f";
  const phone = ps.whatsapp || ps.phone;
  if (phone) { ctx.fillText("☎ " + phone, 70, cy); cy += 28; }
  if (ps.website) { ctx.fillText("🌐 " + ps.website, 70, cy); cy += 28; }
  if (ps.address) { ctx.fillText("📍 " + ps.address, 70, cy); cy += 28; }

  if (signatureImg) {
    const sigW = 190;
    const sigH = sigW * ((signatureImg.naturalHeight || 700) / (signatureImg.naturalWidth || 900));
    const sigX = W - 70 - sigW, sigY = bottomY - sigH - 6;
    ctx.drawImage(signatureImg, sigX, sigY, sigW, sigH);
  }
  ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W - 260, bottomY + 16); ctx.lineTo(W - 70, bottomY + 16); ctx.stroke();
  ctx.textAlign = "center"; ctx.font = "12.5px Georgia, serif"; ctx.fillStyle = "#6B7469";
  ctx.fillText(academyName, W - 165, bottomY + 38);

  const verifY = H - 110;
  if (qrImg) ctx.drawImage(qrImg, 70, verifY, 40, 40);
  else drawVerificationPattern(ctx, 70, verifY, 40, payment.receiptNumber); // repli si QR indisponible
  ctx.textAlign = "left"; ctx.font = "9px monospace"; ctx.fillStyle = "#6B7469";
  ctx.fillText(payment.receiptNumber, 122, verifY + 24);

  return canvas;
}

function downloadReceiptPNG(canvas, filename) {
  downloadFile(canvas.toDataURL("image/png"), filename);
}
function downloadReceiptPDF(canvas, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2, maxH = pageH - margin * 2;
  const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
  const drawW = canvas.width * scale, drawH = canvas.height * scale;
  const offsetX = (pageW - drawW) / 2, offsetY = (pageH - drawH) / 2;
  doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", offsetX, offsetY, drawW, drawH);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function shareReceiptPNG(canvas, filename, shareText) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Reçu de paiement", text: shareText });
          resolve(true);
          return;
        } catch (e) { /* annulé, on retombe sur le téléchargement */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      resolve(false);
    }, "image/png");
  });
}

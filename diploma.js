// =============================================================================
// diploma.js — Génération automatique des diplômes en PDF (FR / EN / IT)
// Utilise jsPDF (chargé depuis un CDN dans index.html, mis en cache par le
// service worker pour un fonctionnement hors ligne après le premier chargement)
// et QRCode.js pour le QR code de vérification.
//
// Design premium : double/triple bordure dorée, motifs géométriques dans les
// coins, silhouette de mosquée discrète, sceau officiel, nom de l'élève en
// calligraphie (rendu via canvas + police web, puis inséré comme image —
// jsPDF ne sait pas nativement afficher de police cursive), titre en
// dégradé doré, signature de l'enseignante (image), QR code de vérification.
// =============================================================================

const GOLD = [180, 140, 45];
const GOLD_LIGHT = [222, 196, 130];
const GOLD_HILITE = [248, 232, 190];
const EMERALD = [14, 99, 85];
const EMERALD_DARK = [10, 74, 64];
const INK = [27, 43, 41];
const CREAM_BG = [251, 247, 236];
// Échelle fixe pixel canvas → millimètre PDF pour les textes stylés (titre,
// nom en calligraphie). Garantit une taille de police visuellement
// cohérente quel que soit le nombre de caractères du texte.
const STYLED_TEXT_PX_TO_MM = 0.16;

function generateCertNumber() {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SZA-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`;
}

const DIPLOMA_LABELS = {
  fr: {
    reading: { title: "DIPLÔME", subtitle: "DE LECTURE ARABE", forLabel: "pour la validation de la séance :" },
    juz: { title: "DIPLÔME", subtitle: "DE MÉMORISATION DU CORAN", forLabel: "pour la mémorisation et la validation du :" },
    of: "décerné à", deliveredOn: "Délivré le", certNumber: "N° de certificat",
    signatureRole: "Direction pédagogique", verify: "Vérification du certificat",
    congrats: "Félicitations pour cette étape accomplie avec sérieux et persévérance.",
    juzBlessing: "Qu'Allah t'accorde la réussite, la constance et facilite la mémorisation de Son Noble Livre.",
  },
  en: {
    reading: { title: "DIPLOMA", subtitle: "OF ARABIC READING", forLabel: "for successfully completing session:" },
    juz: { title: "DIPLOMA", subtitle: "OF QUR'AN MEMORIZATION", forLabel: "for having memorized and validated:" },
    of: "awarded to", deliveredOn: "Issued on", certNumber: "Certificate No.",
    signatureRole: "Academic Direction", verify: "Certificate verification",
    congrats: "Congratulations on this milestone achieved with dedication and perseverance.",
    juzBlessing: "May Allah grant you success, steadfastness, and ease the memorization of His Noble Book.",
  },
  it: {
    reading: { title: "DIPLOMA", subtitle: "DI LETTURA ARABA", forLabel: "per il completamento della sessione:" },
    juz: { title: "DIPLOMA", subtitle: "DI MEMORIZZAZIONE DEL CORANO", forLabel: "per aver memorizzato e convalidato:" },
    of: "rilasciato a", deliveredOn: "Rilasciato il", certNumber: "N. certificato",
    signatureRole: "Direzione didattica", verify: "Verifica del certificato",
    congrats: "Congratulazioni per questo traguardo raggiunto con serietà e perseveranza.",
    juzBlessing: "Che Allah ti conceda successo, costanza e faciliti la memorizzazione del Suo Nobile Libro.",
  },
};

// -----------------------------------------------------------------------
// Assets partagés (logo, signature) — chargés une fois et mis en cache
// -----------------------------------------------------------------------
let _logoDataUrlCache = null;
async function getLogoDataUrl() {
  if (_logoDataUrlCache) return _logoDataUrlCache;
  try {
    const res = await fetch("icon-512.png");
    const blob = await res.blob();
    _logoDataUrlCache = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    _logoDataUrlCache = null;
  }
  return _logoDataUrlCache;
}

let _signatureDataUrlCache = null;
async function getSignatureDataUrl() {
  if (_signatureDataUrlCache !== null) return _signatureDataUrlCache;
  try {
    const res = await fetch("signature-teacher.png");
    if (!res.ok) throw new Error("no signature");
    const blob = await res.blob();
    _signatureDataUrlCache = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    _signatureDataUrlCache = false;
  }
  return _signatureDataUrlCache;
}

// Génère un QR code (dataURL PNG) via la bibliothèque QRCode.js, dans un
// conteneur hors-écran. Retourne null si la bibliothèque n'est pas chargée
// (le diplôme reste généré normalement, juste sans QR code).
async function getQrDataUrl(text) {
  if (typeof QRCode === "undefined") return null;
  try {
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
    document.body.appendChild(container);
    new QRCode(container, { text, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
    await new Promise((r) => setTimeout(r, 60));
    const canvas = container.querySelector("canvas");
    const img = container.querySelector("img");
    let dataUrl = null;
    if (canvas) dataUrl = canvas.toDataURL("image/png");
    else if (img) dataUrl = img.src;
    container.remove();
    return dataUrl;
  } catch (e) {
    return null;
  }
}

// -----------------------------------------------------------------------
// Rendu de texte stylé via canvas (police cursive / dégradé doré) — jsPDF
// ne sachant pas nativement afficher de police script ni de dégradé de
// texte, on dessine le texte sur un canvas HTML (où les polices web et les
// dégradés fonctionnent normalement), puis on insère le résultat comme
// image dans le PDF.
// -----------------------------------------------------------------------
async function renderStyledTextImage(text, opts) {
  const fontWeight = opts.fontWeight || "400";
  const fontSizePx = opts.fontSizePx;
  const fontSpec = `${fontWeight} ${fontSizePx}px "${opts.fontFamily}"`;
  try { await document.fonts.load(fontSpec); } catch (e) { /* ignore */ }
  try { await document.fonts.ready; } catch (e) { /* ignore */ }

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  mctx.font = fontSpec;
  const metrics = mctx.measureText(text);
  const padX = fontSizePx * 0.28;
  const ascent = metrics.actualBoundingBoxAscent || fontSizePx * 0.82;
  const descent = metrics.actualBoundingBoxDescent || fontSizePx * 0.24;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(metrics.width + padX * 2);
  canvas.height = Math.ceil(ascent + descent + padX * 1.4);
  const ctx = canvas.getContext("2d");
  ctx.font = fontSpec;
  ctx.textBaseline = "alphabetic";
  const textX = padX;
  const textY = padX * 0.7 + ascent;

  if (opts.shadow) {
    ctx.save();
    ctx.shadowColor = opts.shadow;
    ctx.shadowBlur = fontSizePx * 0.045;
    ctx.shadowOffsetY = fontSizePx * 0.02;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText(text, textX, textY);
    ctx.restore();
  }

  if (opts.gradientColors) {
    // Dégradé vertical (façon reflet métallique doré) plutôt qu'horizontal :
    // plus proche de l'effet "feuille d'or" recherché.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    opts.gradientColors.forEach(([stop, c]) => grad.addColorStop(stop, c));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = opts.color || "#000000";
  }
  ctx.fillText(text, textX, textY);
  return { dataUrl: canvas.toDataURL("image/png"), pxWidth: canvas.width, pxHeight: canvas.height };
}

// Insère une image générée par renderStyledTextImage dans le PDF, centrée
// horizontalement sur cx, à l'échelle pxToMm (taille de police cohérente
// quel que soit le nombre de caractères — seule la largeur varie avec le
// texte, jamais la hauteur). maxWidthMm : garde-fou anti-débordement pour
// les textes très longs (réduit proportionnellement si nécessaire).
function placeStyledText(doc, styled, cx, y, pxToMm, maxWidthMm) {
  let w = styled.pxWidth * pxToMm;
  let h = styled.pxHeight * pxToMm;
  if (maxWidthMm && w > maxWidthMm) {
    const ratio = maxWidthMm / w;
    w *= ratio;
    h *= ratio;
  }
  doc.addImage(styled.dataUrl, "PNG", cx - w / 2, y, w, h);
  return h;
}

// -----------------------------------------------------------------------
// Éléments décoratifs vectoriels
// -----------------------------------------------------------------------
function drawStar8(doc, cx, cy, rOuter, rInner, style) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  segs.push([pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]]);
  doc.lines(segs, pts[0][0], pts[0][1], [1, 1], style, true);
}

function drawCornerMotif(doc, x, y, size) {
  doc.setFillColor(...EMERALD_DARK);
  doc.roundedRect(x - size / 2, y - size / 2, size, size, 3, 3, "F");
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.7);
  doc.roundedRect(x - size / 2, y - size / 2, size, size, 3, 3, "S");
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.45);
  drawStar8(doc, x, y, size * 0.32, size * 0.15, "S");
  // petit filet doré prolongeant le motif vers le centre de la page
  doc.setLineWidth(0.3);
  doc.setDrawColor(...GOLD_LIGHT);
}

function drawMosqueSilhouette(doc, x, y, scale, mirror) {
  const s = scale * (mirror ? -1 : 1);
  const color = [232, 222, 197];
  doc.setFillColor(...color);
  doc.rect(x, y, 34 * s, 12 * scale, "F");
  doc.circle(x + 17 * s, y, 8.5 * scale, "F");
  doc.circle(x + 5 * s, y + 2 * scale, 4 * scale, "F");
  doc.circle(x + 29 * s, y + 2 * scale, 4 * scale, "F");
  doc.rect(x - 6 * s, y - 9 * scale, 2.6 * scale, 21 * scale, "F");
  doc.circle(x - 4.7 * s, y - 9 * scale, 1.8 * scale, "F");
  doc.rect(x + 37.4 * s, y - 9 * scale, 2.6 * scale, 21 * scale, "F");
  doc.circle(x + 38.7 * s, y - 9 * scale, 1.8 * scale, "F");
}

function drawSeal(doc, cx, cy, radius, lines) {
  // Anneau extérieur en dégradé simulé (plusieurs cercles concentriques de
  // teintes légèrement différentes) pour un effet relief / cire officielle.
  doc.setFillColor(150, 112, 30);
  doc.circle(cx, cy, radius * 1.04, "F");
  doc.setFillColor(...GOLD);
  doc.circle(cx, cy, radius, "F");
  doc.setFillColor(...GOLD_HILITE);
  doc.circle(cx - radius * 0.12, cy - radius * 0.12, radius * 0.5, "F");
  doc.setFillColor(...GOLD);
  doc.circle(cx, cy, radius * 0.86, "F");
  doc.setFillColor(...EMERALD_DARK);
  doc.circle(cx, cy, radius * 0.72, "F");
  doc.setDrawColor(...GOLD_LIGHT);
  doc.setLineWidth(0.45);
  doc.circle(cx, cy, radius * 0.72, "S");
  doc.setDrawColor(...GOLD_HILITE);
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, radius * 0.62, "S");
  const dots = 18;
  for (let i = 0; i < dots; i++) {
    const angle = (Math.PI * 2 * i) / dots;
    const lx = cx + Math.cos(angle) * radius * 0.93;
    const ly = cy + Math.sin(angle) * radius * 0.93;
    doc.setFillColor(...EMERALD_DARK);
    doc.circle(lx, ly, radius * 0.04, "F");
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(radius * 0.6);
  let yOff = cy - (lines.length - 1) * radius * 0.19 + radius * 0.08;
  lines.forEach((line) => {
    doc.text(line, cx, yOff, { align: "center" });
    yOff += radius * 0.37;
  });
}

// Petits repères dorés le long du cadre intérieur (losanges fins), pour un
// ornement discret sans surcharger le diplôme.
function drawEdgeTicks(doc, x, y, w, h, count) {
  doc.setFillColor(...GOLD_LIGHT);
  const tickHoriz = (w - 40) / (count - 1);
  for (let i = 0; i < count; i++) {
    const tx = x + 20 + i * tickHoriz;
    drawDiamond(doc, tx, y, 1.1);
    drawDiamond(doc, tx, y + h, 1.1);
  }
  const tickVert = (h - 40) / (Math.max(2, Math.round(count * (h / w))) - 1);
  const vCount = Math.max(2, Math.round(count * (h / w)));
  for (let i = 0; i < vCount; i++) {
    const ty = y + 20 + i * tickVert;
    drawDiamond(doc, x, ty, 1.1);
    drawDiamond(doc, x + w, ty, 1.1);
  }
}
function drawDiamond(doc, cx, cy, r) {
  // Losange : gauche -> haut -> droite -> bas -> (fermeture vers gauche)
  doc.lines([[r, -r], [r, r], [-r, r], [-r, -r]], cx - r, cy, [1, 1], "F", true);
}

function drawTexture(doc, x, y, w, h) {
  doc.setFillColor(241, 232, 206);
  const step = 7;
  for (let py = y; py < y + h; py += step) {
    for (let px = x; px < x + w; px += step) {
      doc.circle(px, py, 0.22, "F");
    }
  }
  // Fines fibres discrètes façon papier de luxe
  doc.setDrawColor(238, 228, 198);
  doc.setLineWidth(0.12);
  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 46; i++) {
    const fx = x + rand() * w;
    const fy = y + rand() * h;
    const len = 3 + rand() * 5;
    const angle = rand() * Math.PI;
    doc.line(fx, fy, fx + Math.cos(angle) * len, fy + Math.sin(angle) * len);
  }
}

// -----------------------------------------------------------------------
// Diplôme premium — Lecture arabe (séances) & Mémorisation (Ajza')
// -----------------------------------------------------------------------
async function buildDiplomaPdf(opts) {
  // opts: { studentName, achievementTitle, lang, certNumber, issuedAtLabel, kind: 'reading'|'juz' }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = DIPLOMA_LABELS[opts.lang] || DIPLOMA_LABELS.fr;
  const K = L[opts.kind] || L.reading;

  // Fond + texture façon parchemin
  doc.setFillColor(...CREAM_BG);
  doc.rect(0, 0, W, H, "F");
  drawTexture(doc, 16, 16, W - 32, H - 32);

  // Silhouettes de mosquée, très discrètes, de part et d'autre
  drawMosqueSilhouette(doc, 24, 132, 1.05, false);
  drawMosqueSilhouette(doc, W - 24, 132, 1.05, true);

  // Bordure double dorée + ornements fins le long du cadre intérieur
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.8);
  doc.roundedRect(6, 6, W - 12, H - 12, 6, 6);
  doc.setLineWidth(0.5);
  doc.setDrawColor(...GOLD_LIGHT);
  doc.roundedRect(11, 11, W - 22, H - 22, 10, 10);
  drawEdgeTicks(doc, 11, 11, W - 22, H - 22, 9);

  // Motifs de coin
  const cs = 22;
  drawCornerMotif(doc, 18, 18, cs);
  drawCornerMotif(doc, W - 18, 18, cs);
  drawCornerMotif(doc, 18, H - 18, cs);
  drawCornerMotif(doc, W - 18, H - 18, cs);

  // Logo + nom de l'académie
  const logoDataUrl = await getLogoDataUrl();
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", W / 2 - 11, 14, 22, 22);
  doc.setTextColor(...EMERALD);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 42, { align: "center" });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(W / 2 - 30, 45, W / 2 + 30, 45);

  // Titre en dégradé doré façon feuille d'or (rendu canvas)
  const titleStyled = await renderStyledTextImage(K.title, {
    fontFamily: "Playfair Display", fontWeight: "800", fontSizePx: 130,
    gradientColors: [[0, "#7a5c1e"], [0.32, "#f4dfa0"], [0.5, "#fffbe8"], [0.68, "#e0b95f"], [1, "#7a5c1e"]],
    shadow: "#3a2b0d",
  });
  placeStyledText(doc, titleStyled, W / 2, 48, STYLED_TEXT_PX_TO_MM, 170);

  doc.setTextColor(...EMERALD);
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.text(K.subtitle, W / 2, 80, { align: "center" });

  doc.setFillColor(...GOLD);
  drawStar8(doc, W / 2, 88, 2.2, 1, "F");

  doc.setTextColor(...INK);
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.text(L.of, W / 2, 96, { align: "center" });

  // Nom de l'élève en calligraphie, bien plus grand (+35%) — c'est
  // l'élément qui doit attirer le regard en premier.
  const nameStyled = await renderStyledTextImage(opts.studentName, {
    fontFamily: "Great Vibes", fontWeight: "400", fontSizePx: 100, color: "#0E6355",
  });
  placeStyledText(doc, nameStyled, W / 2, 99, STYLED_TEXT_PX_TO_MM * 1.35, 235);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(W / 2 - 34, 128, W / 2 + 34, 128);

  doc.setTextColor(...INK);
  doc.setFont("times", "normal");
  doc.setFontSize(11.5);
  doc.text(K.forLabel, W / 2, 136, { align: "center" });

  // Pastille (nom de la séance / du Juz')
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  const pillTextW = doc.getTextWidth(opts.achievementTitle);
  const pillW = pillTextW + 22;
  const pillH = 11;
  doc.setFillColor(...EMERALD_DARK);
  doc.roundedRect(W / 2 - pillW / 2, 141, pillW, pillH, 5, 5, "F");
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.roundedRect(W / 2 - pillW / 2, 141, pillW, pillH, 5, 5, "S");
  doc.setTextColor(255, 255, 255);
  doc.text(opts.achievementTitle, W / 2, 141 + pillH / 2 + 1.6, { align: "center" });

  // Message de félicitations — agrandi pour une meilleure lisibilité
  const msg = opts.kind === "juz" ? `${L.congrats} ${L.juzBlessing}` : t("encourage", opts.studentName.split(" ")[0] || opts.studentName);
  doc.setTextColor(...INK);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  const msgLines = doc.splitTextToSize(msg, W - 90);
  doc.text(msgLines, W / 2, 163, { align: "center" });
  const msgLineHeightMm = 11 * 0.3528 * 1.15;
  const msgEndY = 163 + msgLines.length * msgLineHeightMm;

  const dividerY = Math.min(184, Math.max(178, msgEndY + 8));
  doc.setDrawColor(...GOLD_LIGHT);
  doc.setLineWidth(0.3);
  doc.line(W / 2 - 20, dividerY, W / 2 + 20, dividerY);

  // Pied de page : date/certificat (gauche), sceau (centre), signature (droite), QR (extrême droite)
  const footY = Math.min(196, Math.max(190, dividerY + 8));
  doc.setTextColor(...INK);
  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  doc.text(`${L.deliveredOn} : ${opts.issuedAtLabel}`, 24, footY);
  doc.setFontSize(8.5);
  doc.setTextColor(120, 112, 90);
  doc.text(`${L.certNumber} : ${opts.certNumber}`, 24, footY + 6);

  drawSeal(doc, W / 2, footY - 2, 13, ["Seyda", "Zeynab", "Academy"]);

  const sigX = W - 78;
  doc.setTextColor(...INK);
  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  doc.text("Seyda Zeynab Academy", sigX, footY - 12, { align: "center" });
  doc.text(L.signatureRole, sigX, footY - 7, { align: "center" });
  const signatureDataUrl = await getSignatureDataUrl();
  if (signatureDataUrl) {
    const sigW = 32;
    const sigImgProps = doc.getImageProperties(signatureDataUrl);
    const sigH = sigW * (sigImgProps.height / sigImgProps.width);
    doc.addImage(signatureDataUrl, "PNG", sigX - sigW / 2, footY - 6, sigW, sigH);
  }
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.2);
  doc.line(sigX - 20, footY + 8, sigX + 20, footY + 8);

  const qrDataUrl = await getQrDataUrl(`SZA-VERIFY:${opts.certNumber}`);
  if (qrDataUrl) {
    const qrSize = 20;
    doc.addImage(qrDataUrl, "PNG", W - 24 - qrSize, footY - 14, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(120, 112, 90);
    doc.text(L.verify, W - 24 - qrSize / 2, footY + 8, { align: "center" });
  }

  const blob = doc.output("blob");
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

async function createDiplomaForSession(session, lang) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const certNumber = generateCertNumber();
  const issuedAt = Date.now();
  const issuedAtLabel = new Date(issuedAt).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );
  const sessionTitleStr = sessionTitle(session);

  const { dataUrl } = await buildDiplomaPdf({
    studentName, achievementTitle: sessionTitleStr, lang, certNumber, issuedAtLabel, kind: "reading",
  });

  const diploma = {
    id: certNumber,
    studentId: STATE.activeStudentId,
    levelId: session.id,
    levelTitle: sessionTitleStr,
    category: "session",
    lang,
    studentName,
    certNumber,
    issuedAt,
    pdfDataUrl: dataUrl,
  };
  await DB.saveDiploma(diploma);
  return diploma;
}

// ---- Diplôme de Juz' mémorisé et validé ----
async function createDiplomaForJuz(juz, lang) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const certNumber = generateCertNumber();
  const issuedAt = Date.now();
  const issuedAtLabel = new Date(issuedAt).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );
  const titleStr = juzLabelPlain(juz);

  const { dataUrl } = await buildDiplomaPdf({
    studentName, achievementTitle: titleStr, lang, certNumber, issuedAtLabel, kind: "juz",
  });

  const diploma = {
    id: certNumber,
    studentId: STATE.activeStudentId,
    levelId: juz.id,
    levelTitle: titleStr,
    category: "juz",
    lang,
    studentName,
    certNumber,
    issuedAt,
    pdfDataUrl: dataUrl,
  };
  await DB.saveDiploma(diploma);
  return diploma;
}

// -----------------------------------------------------------------------
// Diplôme Khatm Al-Qur'an — le plus prestigieux de l'application
// -----------------------------------------------------------------------
const KHATM_LABELS = {
  fr: { title: "KHATM AL-QUR'AN", subtitle: "Mémorisation complète du Noble Coran", of: "décerné à", body: (name) => `Il est certifié que ${name} a achevé, par la grâce d'Allah, la mémorisation complète des 30 Ajza' du Noble Coran. Qu'Allah accepte cet effort, en fasse une lumière pour son cœur et une source de bénédiction pour toute sa vie.`, signature: "Direction pédagogique", verify: "Vérification du certificat" },
  en: { title: "KHATM AL-QUR'AN", subtitle: "Complete memorization of the Noble Qur'an", of: "awarded to", body: (name) => `This certifies that ${name} has completed, by the grace of Allah, the full memorization of the 30 Ajza' of the Noble Qur'an. May Allah accept this effort, make it a light for the heart and a source of blessing for a lifetime.`, signature: "Academic Direction", verify: "Certificate verification" },
  it: { title: "KHATM AL-QUR'AN", subtitle: "Memorizzazione completa del Nobile Corano", of: "rilasciato a", body: (name) => `Si certifica che ${name} ha completato, per grazia di Allah, la memorizzazione completa dei 30 Ajza' del Nobile Corano. Che Allah accetti questo sforzo e ne faccia una luce per il cuore e una fonte di benedizione per tutta la vita.`, signature: "Direzione didattica", verify: "Verifica del certificato" },
};

async function buildKhatmDiplomaPdf(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = KHATM_LABELS[opts.lang] || KHATM_LABELS.fr;

  // Fond ivoire + texture (légèrement plus dorée que les diplômes standards)
  doc.setFillColor(253, 250, 240);
  doc.rect(0, 0, W, H, "F");
  // Léger voile doré discret pour distinguer ce diplôme des autres
  doc.setFillColor(250, 240, 210);
  doc.rect(6, 6, W - 12, H - 12, "F");
  drawTexture(doc, 18, 18, W - 36, H - 36);

  drawMosqueSilhouette(doc, 26, 136, 1.3, false);
  drawMosqueSilhouette(doc, W - 26, 136, 1.3, true);

  // Quadruple bordure dorée — le plus prestigieux de l'académie
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2.6);
  doc.roundedRect(5, 5, W - 10, H - 10, 6, 6);
  doc.setDrawColor(...GOLD_HILITE);
  doc.setLineWidth(0.5);
  doc.roundedRect(8, 8, W - 16, H - 16, 8, 8);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.roundedRect(11.5, 11.5, W - 23, H - 23, 9, 9);
  doc.setDrawColor(...GOLD_LIGHT);
  doc.setLineWidth(0.4);
  doc.roundedRect(15.5, 15.5, W - 31, H - 31, 12, 12);
  drawEdgeTicks(doc, 15.5, 15.5, W - 31, H - 31, 11);

  // Motifs de coin, plus grands et doublés d'un second anneau
  const cs = 30;
  [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]].forEach(([x, y]) => {
    doc.setDrawColor(...GOLD_LIGHT);
    doc.setLineWidth(0.4);
    doc.circle(x, y, cs * 0.62, "S");
    drawCornerMotif(doc, x, y, cs);
  });

  const logoDataUrl = await getLogoDataUrl();
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", W / 2 - 14, 19, 28, 28);

  doc.setTextColor(...EMERALD);
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 53, { align: "center" });
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(W / 2 - 38, 56, W / 2 + 38, 56);
  doc.setFillColor(...GOLD);
  drawStar8(doc, W / 2 - 38, 56, 1.4, 0.6, "F");
  drawStar8(doc, W / 2 + 38, 56, 1.4, 0.6, "F");

  const titleStyled = await renderStyledTextImage(L.title, {
    fontFamily: "Playfair Display", fontWeight: "800", fontSizePx: 140,
    gradientColors: [[0, "#6e520f"], [0.28, "#f4dfa0"], [0.5, "#fffdf3"], [0.72, "#d9ad4d"], [1, "#6e520f"]],
    shadow: "#33260a",
  });
  placeStyledText(doc, titleStyled, W / 2, 61, STYLED_TEXT_PX_TO_MM * 1.08, 210);

  doc.setTextColor(...EMERALD);
  doc.setFont("times", "bolditalic");
  doc.setFontSize(16);
  doc.text(L.subtitle, W / 2, 100, { align: "center" });

  doc.setFillColor(...GOLD);
  drawStar8(doc, W / 2, 108, 2.4, 1.1, "F");

  doc.setTextColor(...INK);
  doc.setFont("times", "italic");
  doc.setFontSize(12.5);
  doc.text(L.of, W / 2, 116, { align: "center" });

  // Nom de l'élève — le plus grand de tous les documents de l'académie
  const nameStyled = await renderStyledTextImage(opts.studentName, {
    fontFamily: "Great Vibes", fontWeight: "400", fontSizePx: 100, color: "#0E6355",
  });
  placeStyledText(doc, nameStyled, W / 2, 119, STYLED_TEXT_PX_TO_MM * 1.45, 245);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(W / 2 - 44, 149, W / 2 + 44, 149);

  doc.setTextColor(...INK);
  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  const bodyLines = doc.splitTextToSize(L.body(opts.studentName), W - 95);
  doc.text(bodyLines, W / 2, 159, { align: "center" });
  const bodyLineHeightMm = 10.5 * 0.3528 * 1.15;
  const bodyEndY = 159 + bodyLines.length * bodyLineHeightMm;

  const footY = Math.min(198, Math.max(190, bodyEndY + 18));
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(`${t("deliveredOn")} : ${opts.issuedAtLabel}`, 26, footY);
  doc.setFontSize(8.5);
  doc.setTextColor(140, 125, 90);
  doc.text(`${t("certNumber")} : ${opts.certNumber}`, 26, footY + 6);

  // Sceau imposant, nettement plus grand que sur les autres diplômes
  drawSeal(doc, W / 2, footY - 4, 19, ["Khatm", "Al-Qur'an"]);

  const sigX = W - 82;
  doc.setTextColor(...INK);
  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  doc.text("Seyda Zeynab Academy", sigX, footY - 16, { align: "center" });
  doc.text(L.signature, sigX, footY - 11, { align: "center" });
  const signatureDataUrl = await getSignatureDataUrl();
  if (signatureDataUrl) {
    const sigW = 34;
    const sigImgProps = doc.getImageProperties(signatureDataUrl);
    const sigH = sigW * (sigImgProps.height / sigImgProps.width);
    doc.addImage(signatureDataUrl, "PNG", sigX - sigW / 2, footY - 9, sigW, sigH);
  }
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.2);
  doc.line(sigX - 22, footY + 8, sigX + 22, footY + 8);

  const qrDataUrl = await getQrDataUrl(`SZA-VERIFY-KHATM:${opts.certNumber}`);
  if (qrDataUrl) {
    const qrSize = 22;
    doc.addImage(qrDataUrl, "PNG", W - 28 - qrSize, footY - 16, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(140, 125, 90);
    doc.text(L.verify, W - 28 - qrSize / 2, footY + 8, { align: "center" });
  }

  const blob = doc.output("blob");
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

async function createKhatmDiploma(lang) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const certNumber = generateCertNumber();
  const issuedAt = Date.now();
  const issuedAtLabel = new Date(issuedAt).toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );

  const { dataUrl } = await buildKhatmDiplomaPdf({ studentName, lang, certNumber, issuedAtLabel });

  const diploma = {
    id: certNumber,
    studentId: STATE.activeStudentId,
    levelId: "khatm",
    levelTitle: KHATM_LABELS.fr.title,
    category: "khatm",
    lang,
    studentName,
    certNumber,
    issuedAt,
    pdfDataUrl: dataUrl,
  };
  await DB.saveDiploma(diploma);
  return diploma;
}

function downloadFile(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function shareFile(dataUrl, filename, title) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
  } catch (e) { /* fall through to download */ }
  downloadFile(dataUrl, filename);
  return false;
}

function downloadDiploma(diploma) {
  downloadFile(diploma.pdfDataUrl, `Diplome_${diploma.levelId}_${diploma.certNumber}.pdf`);
}

async function shareDiploma(diploma) {
  return shareFile(diploma.pdfDataUrl, `Diplome_${diploma.certNumber}.pdf`, diploma.levelTitle);
}

// =============================================================================
// BULLETINS D'ÉVALUATION — à présenter aux parents. Deux formats :
//  - "cumulative" : toutes les séances débloquées à ce jour (une ligne par
//    séance, un statut par matière)
//  - "session" : le détail d'une seule séance
// =============================================================================

const BULLETIN_LABELS = {
  fr: {
    title: "BULLETIN D'ÉVALUATION",
    cumulativeSubtitle: "Bulletin complet — toutes séances suivies",
    sessionSubtitle: (n) => `Bulletin — ${n}`,
    student: "Élève", generatedOn: "Établi le", bulletinNumber: "N° bulletin",
    session_col: "Séance", status_col: "Statut",
    yes: "Acquis", no: "En cours",
    validated: "Séance validée", inProgress: "Séance en cours",
    comment: "Appréciation de l'enseignante",
    observations: "Observations générales",
    decision: "Décision pédagogique",
    decisionNone: "Non définie à ce jour",
    signature: "Seyda Zeynab Academy — Signature de l'enseignante",
    overallProgress: "Progression globale",
    verify: "Vérification du bulletin",
  },
  en: {
    title: "EVALUATION REPORT",
    cumulativeSubtitle: "Full report — all sessions so far",
    sessionSubtitle: (n) => `Report — ${n}`,
    student: "Student", generatedOn: "Issued on", bulletinNumber: "Report No.",
    session_col: "Session", status_col: "Status",
    yes: "Acquired", no: "In progress",
    validated: "Session validated", inProgress: "Session in progress",
    comment: "Teacher's comment",
    observations: "General observations",
    decision: "Pedagogical decision",
    decisionNone: "Not yet decided",
    signature: "Seyda Zeynab Academy — Teacher's signature",
    overallProgress: "Overall progress",
    verify: "Report verification",
  },
  it: {
    title: "SCHEDA DI VALUTAZIONE",
    cumulativeSubtitle: "Scheda completa — tutte le sessioni finora",
    sessionSubtitle: (n) => `Scheda — ${n}`,
    student: "Studente", generatedOn: "Rilasciata il", bulletinNumber: "N. scheda",
    session_col: "Sessione", status_col: "Stato",
    yes: "Acquisito", no: "In corso",
    validated: "Sessione convalidata", inProgress: "Sessione in corso",
    comment: "Commento dell'insegnante",
    observations: "Osservazioni generali",
    decision: "Decisione didattica",
    decisionNone: "Non ancora decisa",
    signature: "Seyda Zeynab Academy — Firma dell'insegnante",
    overallProgress: "Progresso complessivo",
    verify: "Verifica della scheda",
  },
};

/**
 * @param {object} opts
 *  type: "cumulative" | "session"
 *  studentName, lang, generatedAtLabel, comment
 *  rows: [{ sessionTitle, subjectDone: [bool,bool,bool,bool,bool], validated }]
 */
async function buildBulletinPdf(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const L = BULLETIN_LABELS[opts.lang] || BULLETIN_LABELS.fr;

  const emerald = [14, 99, 85];
  const gold = [200, 155, 60];
  const ink = [27, 43, 41];
  const inkSoft = [110, 118, 114];
  const marginX = 14;

  doc.setFillColor(250, 246, 238);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.8);
  doc.rect(6, 6, W - 12, H - 12);

  const logoDataUrl = await getLogoDataUrl();
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", W / 2 - 8, 10, 16, 16);

  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(10.5);
  doc.text("SEYDA ZEYNAB ACADEMY", W / 2, 30, { align: "center" });

  doc.setTextColor(...gold);
  doc.setFontSize(18);
  doc.text(L.title, W / 2, 39, { align: "center" });

  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(11);
  const subtitle = opts.type === "cumulative" ? L.cumulativeSubtitle : L.sessionSubtitle(opts.rows[0]?.sessionTitle || "");
  doc.text(subtitle, W / 2, 46, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  doc.text(`${L.student} : ${opts.studentName}`, marginX, 58);
  doc.text(`${L.generatedOn} : ${opts.generatedAtLabel}`, W - marginX, 58, { align: "right" });
  doc.setFontSize(8.5);
  doc.setTextColor(...inkSoft);
  doc.text(`${L.bulletinNumber} : ${opts.bulletinNumber}`, W - marginX, 63, { align: "right" });

  if (opts.type === "cumulative") {
    const totalSessions = opts.rows.length;
    const validatedCount = opts.rows.filter((r) => r.validated).length;
    doc.setTextColor(...inkSoft);
    doc.setFontSize(9.5);
    doc.text(`${L.overallProgress} : ${validatedCount}/${totalSessions}`, marginX, 64);
  }

  // ---- Tableau ----
  const tableTop = 72;
  const colWidths = [40, 21, 21, 21, 21, 24, 32];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableX = (W - tableWidth) / 2;
  const colX = [];
  let cx = tableX;
  colWidths.forEach((w) => { colX.push(cx); cx += w; });

  const headers = [L.session_col, "📖", "🌿", "📚", "📝", "🎯", L.status_col];
  const headerLabels = [L.session_col, "Coran", "Athkars", "Fiqh", "Exer.", "Éval.", L.status_col];

  let y = tableTop;
  doc.setFillColor(...emerald);
  doc.rect(tableX, y - 5, tableWidth, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(8.5);
  headerLabels.forEach((h, i) => {
    doc.text(h, colX[i] + colWidths[i] / 2, y, { align: "center" });
  });
  y += 7;

  doc.setFont("times", "normal");
  doc.setFontSize(9);
  opts.rows.forEach((row, idx) => {
    const rowH = 8;
    if (idx % 2 === 1) {
      doc.setFillColor(240, 233, 216);
      doc.rect(tableX, y - 5, tableWidth, rowH, "F");
    }
    doc.setTextColor(...ink);
    doc.text(row.sessionTitle, colX[0] + 3, y);
    row.subjectDone.forEach((done, i) => {
      doc.setTextColor(...(done ? emerald : inkSoft));
      doc.text(done ? L.yes : L.no, colX[i + 1] + colWidths[i + 1] / 2, y, { align: "center" });
    });
    doc.setTextColor(...(row.validated ? emerald : gold));
    doc.setFont("times", "bold");
    doc.text(row.validated ? L.validated : L.inProgress, colX[6] + colWidths[6] / 2, y, { align: "center" });
    doc.setFont("times", "normal");
    y += rowH;
  });
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  doc.line(tableX, y - 3, tableX + tableWidth, y - 3);

  // ---- Commentaire (appréciation) ----
  y += 12;
  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text(L.comment, marginX, y);
  y += 7;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  const commentBoxHeight = 18;
  doc.rect(marginX, y - 5, W - marginX * 2, commentBoxHeight);
  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  if (opts.comment) {
    const lines = doc.splitTextToSize(opts.comment, W - marginX * 2 - 8);
    doc.text(lines, marginX + 4, y + 3);
  }
  y += commentBoxHeight + 8;

  // ---- Observations générales ----
  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text(L.observations, marginX, y);
  y += 7;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  const obsBoxHeight = 16;
  doc.rect(marginX, y - 5, W - marginX * 2, obsBoxHeight);
  doc.setTextColor(...ink);
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  if (opts.observations) {
    const obsLines = doc.splitTextToSize(opts.observations, W - marginX * 2 - 8);
    doc.text(obsLines, marginX + 4, y + 3);
  }
  y += obsBoxHeight + 8;

  // ---- Décision pédagogique ----
  doc.setTextColor(...emerald);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text(L.decision, marginX, y);
  doc.setFont("times", "normal");
  doc.setTextColor(...ink);
  doc.setFontSize(10.5);
  doc.text(opts.decisionLabel || L.decisionNone, marginX + 62, y);

  // ---- Pied de page ----
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text(L.signature, W / 2, H - 26, { align: "center" });
  const signatureDataUrl = await getSignatureDataUrl();
  if (signatureDataUrl) {
    const sigW = 30;
    const sigImgProps = doc.getImageProperties(signatureDataUrl);
    const sigH = sigW * (sigImgProps.height / sigImgProps.width);
    doc.addImage(signatureDataUrl, "PNG", W / 2 - sigW / 2, H - 24, sigW, sigH);
  }

  const qrDataUrl = await getQrDataUrl(`SZA-VERIFY-BULLETIN:${opts.bulletinNumber}`);
  if (qrDataUrl) {
    const qrSize = 20;
    doc.addImage(qrDataUrl, "PNG", W - marginX - qrSize, H - 24 - qrSize, qrSize, qrSize);
    doc.setFontSize(7.5);
    doc.setTextColor(140, 125, 90);
    doc.text(L.verify, W - marginX - qrSize / 2, H - 22, { align: "center" });
  }

  const blob = doc.output("blob");
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return { blob, dataUrl };
}

/**
 * Construit les données de lignes du tableau pour un bulletin, à partir de
 * l'état de progression courant (STATE). type = "cumulative" ou "session".
 */
async function generateBulletin(type, sessionId, lang, comment, observations) {
  const student = STATE.student;
  const studentName = student?.fullName || "—";
  const issuedAtLabel = new Date().toLocaleDateString(
    lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR"
  );
  const bulletinNumber = generateCertNumber().replace("SZA-", "BULL-");

  const decisionKeyToLabelKey = {
    memorization_started: "decisionMemorization",
    reading_continue: "decisionReadingContinue",
    review: "decisionReview",
    deferred: "decisionDeferred",
  };
  const decisionLabel = student?.trackDecision ? t(decisionKeyToLabelKey[student.trackDecision]) : null;

  let rows = [];
  if (type === "cumulative") {
    const reachable = SESSIONS.filter((s) => !sessionLocked(s.id));
    rows = reachable.map((s) => ({
      sessionTitle: sessionTitle(s),
      subjectDone: SUBJECT_TABS.map((tab) => isSubjectCompleted(s.id, tab.key)),
      validated: isSessionCompleted(s.id),
    }));
  } else {
    const session = SESSIONS.find((s) => s.id === sessionId);
    rows = [{
      sessionTitle: sessionTitle(session),
      subjectDone: SUBJECT_TABS.map((tab) => isSubjectCompleted(session.id, tab.key)),
      validated: isSessionCompleted(session.id),
    }];
  }

  const { dataUrl } = await buildBulletinPdf({
    type, studentName, lang, generatedAtLabel: issuedAtLabel, comment, observations,
    decisionLabel, bulletinNumber, rows,
  });
  const filename = `Bulletin_${studentName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;
  return { dataUrl, filename, studentName };
}

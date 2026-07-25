// =============================================================================
// sessions.js — Contenu pédagogique, organisé par SÉANCES (et non plus par
// matière séparée). Chaque séance contient 5 onglets :
//   coran, athkars, fiqh, exercices, evaluation
// L'élève ne débloque la séance suivante qu'après avoir validé les 5 onglets
// de la séance en cours.
//
// LETTERS : les 28 lettres arabes (réutilisées par l'onglet Coran de la
// Séance 1 : reconnaissance + prononciation, contenu déjà construit avant
// cette restructuration).
//
// SESSIONS : la liste des séances. Seule la Séance 1 a un contenu Coran
// totalement fonctionnel (reconnaissance + prononciation des lettres). Les
// séances 2 et 3 reprennent les sujets Coran/Athkars/Fiqh donnés par
// l'enseignante (Harakat/Tanwin, Athkars, Fiqh) mais sans "moteur"
// d'exercice construit pour l'instant — ils s'affichent "en préparation".
// Les séances 4 à 13 complètent le programme de lecture coranique déjà
// prévu à l'origine (formes des lettres, voyelles longues, soukoun...),
// avec les sujets Athkars/Fiqh à définir par l'enseignante.
//
// Ajouter du contenu à une séance : éditez son objet ci-dessous. Un sujet
// avec engine:null et content:null s'affiche comme "à venir" côté élève.
// =============================================================================

const LETTERS = [
  { id: "alif",  char: "ا", name_fr: "Alif",  name_en: "Alif",  name_it: "Alif",  translit: "A / Ā" },
  { id: "ba",    char: "ب", name_fr: "Bā",    name_en: "Bāʾ",   name_it: "Bāʾ",   translit: "B" },
  { id: "ta",    char: "ت", name_fr: "Tā",    name_en: "Tāʾ",   name_it: "Tāʾ",   translit: "T" },
  { id: "tha",   char: "ث", name_fr: "Thā",   name_en: "Thāʾ",  name_it: "Thāʾ",  translit: "Th" },
  { id: "jim",   char: "ج", name_fr: "Jim",   name_en: "Jīm",   name_it: "Jīm",   translit: "J" },
  { id: "ha",    char: "ح", name_fr: "Hā",    name_en: "Ḥāʾ",   name_it: "Ḥāʾ",   translit: "Ḥ" },
  { id: "kha",   char: "خ", name_fr: "Khā",   name_en: "Khāʾ",  name_it: "Khāʾ",  translit: "Kh" },
  { id: "dal",   char: "د", name_fr: "Dāl",   name_en: "Dāl",   name_it: "Dāl",   translit: "D" },
  { id: "dhal",  char: "ذ", name_fr: "Dhāl",  name_en: "Dhāl",  name_it: "Dhāl",  translit: "Dh" },
  { id: "ra",    char: "ر", name_fr: "Rā",    name_en: "Rāʾ",   name_it: "Rāʾ",   translit: "R" },
  { id: "zay",   char: "ز", name_fr: "Zāy",   name_en: "Zāy",   name_it: "Zāy",   translit: "Z" },
  { id: "sin",   char: "س", name_fr: "Sin",   name_en: "Sīn",   name_it: "Sīn",   translit: "S" },
  { id: "shin",  char: "ش", name_fr: "Shin",  name_en: "Shīn",  name_it: "Shīn",  translit: "Sh" },
  { id: "sad",   char: "ص", name_fr: "Sād",   name_en: "Ṣād",   name_it: "Ṣād",   translit: "Ṣ" },
  { id: "dad",   char: "ض", name_fr: "Dād",   name_en: "Ḍād",   name_it: "Ḍād",   translit: "Ḍ" },
  { id: "ta2",   char: "ط", name_fr: "Tā (emphatique)", name_en: "Ṭāʾ", name_it: "Ṭāʾ", translit: "Ṭ" },
  { id: "za",    char: "ظ", name_fr: "Zā (emphatique)", name_en: "Ẓāʾ", name_it: "Ẓāʾ", translit: "Ẓ" },
  { id: "ayn",   char: "ع", name_fr: "Ayn",   name_en: "ʿAyn",  name_it: "ʿAyn",  translit: "ʿ" },
  { id: "ghayn", char: "غ", name_fr: "Ghayn", name_en: "Ghayn", name_it: "Ghayn", translit: "Gh" },
  { id: "fa",    char: "ف", name_fr: "Fā",    name_en: "Fāʾ",   name_it: "Fāʾ",   translit: "F" },
  { id: "qaf",   char: "ق", name_fr: "Qāf",   name_en: "Qāf",   name_it: "Qāf",   translit: "Q" },
  { id: "kaf",   char: "ك", name_fr: "Kāf",   name_en: "Kāf",   name_it: "Kāf",   translit: "K" },
  { id: "lam",   char: "ل", name_fr: "Lām",   name_en: "Lām",   name_it: "Lām",   translit: "L" },
  { id: "mim",   char: "م", name_fr: "Mim",   name_en: "Mīm",   name_it: "Mīm",   translit: "M" },
  { id: "nun",   char: "ن", name_fr: "Nun",   name_en: "Nūn",   name_it: "Nūn",   translit: "N" },
  { id: "ha2",   char: "ه", name_fr: "Hā",    name_en: "Hāʾ",   name_it: "Hāʾ",   translit: "H" },
  { id: "waw",   char: "و", name_fr: "Wāw",   name_en: "Wāw",   name_it: "Wāw",   translit: "W" },
  { id: "ya",    char: "ي", name_fr: "Yā",    name_en: "Yāʾ",   name_it: "Yāʾ",   translit: "Y" },
];

function letterName(letter) {
  const lang = STATE.settings.language || "fr";
  return letter["name_" + lang] || letter.name_fr;
}

function audioSourcesFor(letterId) {
  return ["mp3", "m4a", "wav", "ogg"].map((ext) => `audio_${letterId}.${ext}`);
}

// -----------------------------------------------------------------------
// HARAKAT : les 28 lettres arabes combinées avec chacune des 3 voyelles
// courtes de base (Fatha, Damma, Kasra) — soit 28 × 3 = 84 syllabes à
// reconnaître et prononcer (اَ اُ اِ, بَ بُ بِ, تَ تُ تِ, ...). Une harakat
// isolée n'a pas de son propre : elle doit toujours être montrée/entendue
// posée sur une lettre, exactement comme on l'enseigne en cours. Réutilisé
// par l'onglet Coran de la Séance 2 (moteur "harakat-combo", même
// principe que "letters-combo" en Séance 1 : reconnaissance +
// prononciation, avec les mêmes moteurs de quiz/écoute que pour les
// lettres puisqu'on dispose maintenant d'assez d'éléments pour tirer des
// distracteurs).
// -----------------------------------------------------------------------
const HARAKAT_MARKS = [
  { id: "fatha", mark: "\u064E", name_fr: "Fatha", name_en: "Fatha", name_it: "Fatha", translit: "a" },
  { id: "damma", mark: "\u064F", name_fr: "Damma", name_en: "Damma", name_it: "Damma", translit: "u" },
  { id: "kasra", mark: "\u0650", name_fr: "Kasra", name_en: "Kasra", name_it: "Kasra", translit: "i" },
];

const HARAKAT = LETTERS.flatMap((letter) =>
  HARAKAT_MARKS.map((hk) => ({
    id: `${letter.id}_${hk.id}`,
    char: letter.char + hk.mark,
    name_fr: `${letter.name_fr} ${hk.name_fr}`,
    name_en: `${letter.name_en} ${hk.name_en}`,
    name_it: `${letter.name_it} ${hk.name_it}`,
    translit: `${letter.translit}${hk.translit}`,
    letterId: letter.id,
    harakatId: hk.id,
  }))
);

function harakatName(h) {
  const lang = STATE.settings.language || "fr";
  return h["name_" + lang] || h.name_fr;
}

function audioSourcesForHarakat(id) {
  return ["mp3", "m4a", "wav", "ogg"].map((ext) => `audio_harakat_${id}.${ext}`);
}

// -----------------------------------------------------------------------
// TANWIN : les 28 lettres combinées avec les 3 signes de nunation
// (Fathatayn "an", Dammatayn "un", Kasratayn "in") — même principe
// exactement que HARAKAT ci-dessus (28 × 3 = 84 syllabes), réutilisé par
// l'onglet Coran de la Séance 3 (moteur "tanwin-combo").
// -----------------------------------------------------------------------
const TANWIN_MARKS = [
  { id: "fathatayn", mark: "\u064B", name_fr: "Fathatayn", name_en: "Fathatayn", name_it: "Fathatayn", translit: "an" },
  { id: "dammatayn", mark: "\u064C", name_fr: "Dammatayn", name_en: "Dammatayn", name_it: "Dammatayn", translit: "un" },
  { id: "kasratayn", mark: "\u064D", name_fr: "Kasratayn", name_en: "Kasratayn", name_it: "Kasratayn", translit: "in" },
];

const TANWIN = LETTERS.flatMap((letter) =>
  TANWIN_MARKS.map((tw) => ({
    id: `${letter.id}_${tw.id}`,
    char: letter.char + tw.mark,
    name_fr: `${letter.name_fr} ${tw.name_fr}`,
    name_en: `${letter.name_en} ${tw.name_en}`,
    name_it: `${letter.name_it} ${tw.name_it}`,
    translit: `${letter.translit}${tw.translit}`,
    letterId: letter.id,
    tanwinId: tw.id,
  }))
);

function tanwinName(tw) {
  const lang = STATE.settings.language || "fr";
  return tw["name_" + lang] || tw.name_fr;
}

function audioSourcesForTanwin(id) {
  return ["mp3", "m4a", "wav", "ogg"].map((ext) => `audio_tanwin_${id}.${ext}`);
}

// -----------------------------------------------------------------------
// VOYELLES LONGUES (Séance 4) : les 28 lettres combinées avec les 3
// lettres de prolongation (ا pour le "â" long, و pour le "û" long, ي
// pour le "î" long) — 28 × 3 = 84 combinaisons. Même principe que
// HARAKAT/TANWIN, réutilisé par l'onglet Coran de la Séance 4 (moteur
// "longvowels-combo").
// -----------------------------------------------------------------------
const LONG_VOWEL_MARKS = [
  { id: "alif", suffix: "\u0627", name_fr: "â long", name_en: "long â", name_it: "â lunga", translit: "â" },
  { id: "waw", suffix: "\u0648", name_fr: "û long", name_en: "long û", name_it: "û lunga", translit: "û" },
  { id: "ya", suffix: "\u064A", name_fr: "î long", name_en: "long î", name_it: "î lunga", translit: "î" },
];

const LONG_VOWELS = LETTERS.flatMap((letter) =>
  LONG_VOWEL_MARKS.map((lv) => ({
    id: `${letter.id}_${lv.id}`,
    char: letter.char + lv.suffix,
    name_fr: `${letter.name_fr} ${lv.name_fr}`,
    name_en: `${letter.name_en} ${lv.name_en}`,
    name_it: `${letter.name_it} ${lv.name_it}`,
    translit: `${letter.translit}${lv.translit}`,
    letterId: letter.id,
  }))
);

function longVowelName(lv) {
  const lang = STATE.settings.language || "fr";
  return lv["name_" + lang] || lv.name_fr;
}

function audioSourcesForLongVowels(id) {
  return ["mp3", "m4a", "wav", "ogg"].map((ext) => `audio_longvowel_${id}.${ext}`);
}

// -----------------------------------------------------------------------
// SOUKOUN (Séance 5) : les 28 lettres portant le soukoun (absence de
// voyelle, ex. بْ) — un seul signe, donc 28 combinaisons (pas ×3).
// Réutilisé par l'onglet Coran de la Séance 5 (moteur "sukun-combo").
// -----------------------------------------------------------------------
const SUKUN = LETTERS.map((letter) => ({
  id: `${letter.id}_sukun`,
  char: letter.char + "\u0652",
  name_fr: `${letter.name_fr} Soukoun`,
  name_en: `${letter.name_en} Sukun`,
  name_it: `${letter.name_it} Sukun`,
  translit: `${letter.translit}ˈ`,
  letterId: letter.id,
}));

function sukunName(s) {
  const lang = STATE.settings.language || "fr";
  return s["name_" + lang] || s.name_fr;
}

function audioSourcesForSukun(id) {
  return ["mp3", "m4a", "wav", "ogg"].map((ext) => `audio_sukun_${id}.${ext}`);
}

// -----------------------------------------------------------------------
// CHADDA (Séance 6) : les 28 lettres redoublées (chadda) combinées avec
// les 3 voyelles courtes (ex. بَّ, بُّ, بِّ) — 28 × 3 = 84 combinaisons.
// Réutilisé par l'onglet Coran de la Séance 6 (moteur "shadda-combo").
// -----------------------------------------------------------------------
const SHADDA = LETTERS.flatMap((letter) =>
  HARAKAT_MARKS.map((hk) => ({
    id: `${letter.id}_shadda_${hk.id}`,
    char: letter.char + "\u0651" + hk.mark,
    name_fr: `${letter.name_fr} Chadda ${hk.name_fr}`,
    name_en: `${letter.name_en} Shadda ${hk.name_en}`,
    name_it: `${letter.name_it} Shadda ${hk.name_it}`,
    translit: `${letter.translit}${letter.translit}${hk.translit}`,
    letterId: letter.id,
  }))
);

function shaddaName(s) {
  const lang = STATE.settings.language || "fr";
  return s["name_" + lang] || s.name_fr;
}

function audioSourcesForShadda(id) {
  return ["mp3", "m4a", "wav", "ogg"].map((ext) => `audio_shadda_${id}.${ext}`);
}

// Chaque "subject" : { key, title_fr, engine, ...contenu spécifique }
// engine possibles : "letters-combo" (Coran séance 1), "content-checklist"
// (Athkars/Fiqh/Exercices/Évaluation génériques), ou null (pas encore de
// contenu -> affiché "en préparation").
const SUBJECT_TABS = [
  { key: "coran",      icon: "📖", label_fr: "Coran",       label_en: "Qur'an",     label_it: "Corano" },
  { key: "athkars",    icon: "🌿", label_fr: "Athkars",     label_en: "Athkar",     label_it: "Athkar" },
  { key: "fiqh",       icon: "📚", label_fr: "Fiqh",        label_en: "Fiqh",       label_it: "Fiqh" },
  { key: "exercices",  icon: "📝", label_fr: "Exercices",   label_en: "Exercises",  label_it: "Esercizi" },
  { key: "evaluation", icon: "🎯", label_fr: "Évaluation",  label_en: "Evaluation", label_it: "Valutazione" },
];

function subjectTabLabel(tab) {
  const lang = STATE.settings.language || "fr";
  return tab["label_" + lang] || tab.label_fr;
}

const SESSIONS = [
  {
    id: 1,
    title_fr: "Séance 1", title_en: "Session 1", title_it: "Sessione 1",
    subjects: {
      coran: {
        title_fr: "Alphabet", title_en: "Alphabet", title_it: "Alfabeto",
        engine: "letters-combo",
      },
      athkars: {
        title_fr: "Avant de manger", title_en: "Before eating", title_it: "Prima di mangiare",
        engine: "content-checklist",
      },
      fiqh: {
        title_fr: "Les piliers de l'Islam", title_en: "The pillars of Islam", title_it: "I pilastri dell'Islam",
        engine: "content-checklist",
      },
      exercices: { engine: "content-checklist" },
      evaluation: { engine: "content-checklist" },
    },
  },
  {
    id: 2,
    title_fr: "Séance 2", title_en: "Session 2", title_it: "Sessione 2",
    subjects: {
      coran: {
        title_fr: "Harakat (voyelles courtes)", title_en: "Harakat (short vowels)", title_it: "Harakat (vocali brevi)",
        engine: "harakat-combo",
      },
      athkars: {
        title_fr: "Après avoir mangé", title_en: "After eating", title_it: "Dopo aver mangiato",
        engine: "content-checklist",
      },
      fiqh: {
        title_fr: "Les cinq prières", title_en: "The five prayers", title_it: "Le cinque preghiere",
        engine: "content-checklist",
      },
      exercices: { engine: "content-checklist" },
      evaluation: { engine: "content-checklist" },
    },
  },
  {
    id: 3,
    title_fr: "Séance 3", title_en: "Session 3", title_it: "Sessione 3",
    subjects: {
      coran: {
        title_fr: "Tanwin", title_en: "Tanwin", title_it: "Tanwin",
        engine: "tanwin-combo",
      },
      athkars: {
        title_fr: "Entrée et sortie des toilettes", title_en: "Entering and leaving the toilet", title_it: "Entrare e uscire dal bagno",
        engine: "content-checklist",
      },
      fiqh: {
        title_fr: "Les ablutions", title_en: "Ablutions", title_it: "Le abluzioni",
        engine: "content-checklist",
      },
      exercices: { engine: "content-checklist" },
      evaluation: { engine: "content-checklist" },
    },
  },
  // ---- Séances 4 à 13 : suite du programme de lecture coranique déjà
  // prévue à l'origine. Sujets Athkars/Fiqh à définir par l'enseignante
  // (affichés "à définir" tant qu'aucun titre n'est renseigné ci-dessous).
  { id: 4,  title_fr: "Séance 4",  title_en: "Session 4",  title_it: "Sessione 4",
    subjects: { coran: { title_fr: "Voyelles longues", title_en: "Long vowels", title_it: "Vocali lunghe", engine: "longvowels-combo" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 5,  title_fr: "Séance 5",  title_en: "Session 5",  title_it: "Sessione 5",
    subjects: { coran: { title_fr: "Soukoun", title_en: "Sukun", title_it: "Sukun", engine: "sukun-combo" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 6,  title_fr: "Séance 6",  title_en: "Session 6",  title_it: "Sessione 6",
    subjects: { coran: { title_fr: "Chadda", title_en: "Shadda", title_it: "Shadda", engine: "shadda-combo" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 7,  title_fr: "Séance 7",  title_en: "Session 7",  title_it: "Sessione 7",
    subjects: { coran: { title_fr: "Lecture des syllabes", title_en: "Reading syllables", title_it: "Lettura delle sillabe", engine: "content-checklist" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 8,  title_fr: "Séance 8",  title_en: "Session 8",  title_it: "Sessione 8",
    subjects: { coran: { title_fr: "Lecture des mots simples", title_en: "Reading simple words", title_it: "Lettura di parole semplici", engine: "content-checklist" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 9,  title_fr: "Séance 9",  title_en: "Session 9",  title_it: "Sessione 9",
    subjects: { coran: { title_fr: "Lecture des phrases", title_en: "Reading sentences", title_it: "Lettura delle frasi", engine: "content-checklist" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 10, title_fr: "Séance 10", title_en: "Session 10", title_it: "Sessione 10",
    subjects: { coran: { title_fr: "Révisions générales", title_en: "General review", title_it: "Revisione generale", engine: "content-checklist" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 11, title_fr: "Séance 11", title_en: "Session 11", title_it: "Sessione 11",
    subjects: { coran: { title_fr: "Introduction au Tajwid", title_en: "Introduction to Tajwid", title_it: "Introduzione al Tajwid", engine: "content-checklist" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 12, title_fr: "Séance 12", title_en: "Session 12", title_it: "Sessione 12",
    subjects: { coran: { title_fr: "Lecture des sourates courtes", title_en: "Reading short surahs", title_it: "Lettura delle sure brevi", engine: "content-checklist" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
  { id: 13, title_fr: "Séance 13", title_en: "Session 13", title_it: "Sessione 13",
    subjects: { coran: { title_fr: "Lecture fluide dans le Moushaf", title_en: "Fluent reading in the Mushaf", title_it: "Lettura fluente nel Mushaf", engine: "content-checklist" },
      athkars: { title_fr: null, engine: null }, fiqh: { title_fr: null, engine: null },
      exercices: { engine: "content-checklist" }, evaluation: { engine: "content-checklist" } } },
];

function sessionTitle(session, langOverride) {
  const lang = langOverride || STATE.settings.language || "fr";
  return session["title_" + lang] || session.title_fr;
}
function subjectTitle(subject) {
  if (!subject || !subject.title_fr) return null;
  const lang = STATE.settings.language || "fr";
  return subject["title_" + lang] || subject.title_fr;
}

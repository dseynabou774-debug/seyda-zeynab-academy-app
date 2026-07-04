// =============================================================================
// levels.js — Contenu pédagogique
//
// LETTERS : les 28 lettres arabes (utilisées par les niveaux 1 & 2, qui sont
// entièrement fonctionnels dans cette version).
//
// LEVELS : les 15 niveaux du plan pédagogique demandé. Seuls les niveaux 1 et
// 2 ont un "engine" d'exercices implémenté pour l'instant ; les niveaux 3 à 15
// sont déjà présents dans le parcours (visibles, dans l'ordre, avec leur
// description) mais affichent "contenu en préparation" tant que l'enseignante
// (ou un futur développement) n'y a pas ajouté d'exercices concrets. La
// structure est volontairement prête à recevoir ces contenus : il suffit
// d'ajouter un "engine" pour ce level.id dans app.js (voir renderLevelScreen).
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
  // Plusieurs formats acceptés : selon l'app d'enregistrement utilisée sur le
  // téléphone (Voice Recorder, etc.), le fichier peut être .mp3, .m4a, .wav
  // ou .ogg. Le navigateur essaie chaque source dans l'ordre et garde la
  // première qui fonctionne — aucune conversion de format n'est nécessaire.
  return ["mp3", "m4a", "wav", "ogg"].map((ext) => `audio_${letterId}.${ext}`);
}

const LEVELS = [
  { id: 1,  key: "letters_recognition", engine: "flashcard-quiz",
    title_fr: "Reconnaissance des lettres", title_en: "Letter recognition", title_it: "Riconoscimento delle lettere",
    desc_fr: "Découvrir et mémoriser les 28 lettres de l'alphabet arabe.",
    desc_en: "Discover and memorize the 28 letters of the Arabic alphabet.",
    desc_it: "Scoprire e memorizzare le 28 lettere dell'alfabeto arabo." },
  { id: 2,  key: "letters_pronunciation", engine: "listen-repeat",
    title_fr: "Prononciation des lettres", title_en: "Letter pronunciation", title_it: "Pronuncia delle lettere",
    desc_fr: "Écouter chaque lettre et s'entraîner à la prononcer.",
    desc_en: "Listen to each letter and practice pronouncing it.",
    desc_it: "Ascolta ogni lettera ed esercitati a pronunciarla." },
  { id: 3,  key: "letter_forms", engine: null,
    title_fr: "Formes des lettres", title_en: "Letter forms", title_it: "Forme delle lettere",
    desc_fr: "Forme isolée, initiale, médiane et finale de chaque lettre.",
    desc_en: "Isolated, initial, medial and final form of each letter.",
    desc_it: "Forma isolata, iniziale, mediana e finale di ogni lettera." },
  { id: 4,  key: "short_vowels", engine: null,
    title_fr: "Voyelles courtes", title_en: "Short vowels", title_it: "Vocali brevi",
    desc_fr: "Fatha, Kasra, Damma.", desc_en: "Fatha, Kasra, Damma.", desc_it: "Fatha, Kasra, Damma." },
  { id: 5,  key: "long_vowels", engine: null,
    title_fr: "Voyelles longues", title_en: "Long vowels", title_it: "Vocali lunghe",
    desc_fr: "Prolongement des voyelles.", desc_en: "Vowel elongation.", desc_it: "Prolungamento delle vocali." },
  { id: 6,  key: "tanwin", engine: null,
    title_fr: "Tanwin", title_en: "Tanwin", title_it: "Tanwin",
    desc_fr: "La nunation en fin de mot.", desc_en: "Nunation at the end of a word.", desc_it: "La nunazione a fine parola." },
  { id: 7,  key: "sukun", engine: null,
    title_fr: "Soukoun", title_en: "Sukun", title_it: "Sukun",
    desc_fr: "L'absence de voyelle.", desc_en: "The absence of a vowel.", desc_it: "L'assenza di vocale." },
  { id: 8,  key: "shadda", engine: null,
    title_fr: "Chadda", title_en: "Shadda", title_it: "Shadda",
    desc_fr: "La duplication d'une consonne.", desc_en: "Consonant doubling.", desc_it: "Il raddoppiamento della consonante." },
  { id: 9,  key: "syllables", engine: null,
    title_fr: "Lecture des syllabes", title_en: "Reading syllables", title_it: "Lettura delle sillabe",
    desc_fr: "Assembler lettres et voyelles.", desc_en: "Combining letters and vowels.", desc_it: "Unire lettere e vocali." },
  { id: 10, key: "simple_words", engine: null,
    title_fr: "Lecture des mots simples", title_en: "Reading simple words", title_it: "Lettura di parole semplici",
    desc_fr: "Premiers mots courts.", desc_en: "First short words.", desc_it: "Prime parole brevi." },
  { id: 11, key: "sentences", engine: null,
    title_fr: "Lecture des phrases", title_en: "Reading sentences", title_it: "Lettura delle frasi",
    desc_fr: "Assembler des mots en phrases.", desc_en: "Combining words into sentences.", desc_it: "Unire le parole in frasi." },
  { id: 12, key: "general_review", engine: null,
    title_fr: "Révisions générales", title_en: "General review", title_it: "Revisione generale",
    desc_fr: "Consolider tous les acquis.", desc_en: "Consolidate everything learned.", desc_it: "Consolidare quanto appreso." },
  { id: 13, key: "tajwid_intro", engine: null,
    title_fr: "Introduction au Tajwid", title_en: "Introduction to Tajwid", title_it: "Introduzione al Tajwid",
    desc_fr: "Les règles fondamentales.", desc_en: "The fundamental rules.", desc_it: "Le regole fondamentali." },
  { id: 14, key: "short_surahs", engine: null,
    title_fr: "Lecture des sourates courtes", title_en: "Reading short surahs", title_it: "Lettura delle sure brevi",
    desc_fr: "Premières sourates du Coran.", desc_en: "First surahs of the Qur'an.", desc_it: "Prime sure del Corano." },
  { id: 15, key: "moushaf_fluency", engine: null,
    title_fr: "Lecture fluide dans le Moushaf", title_en: "Fluent reading in the Mushaf", title_it: "Lettura fluente nel Mushaf",
    desc_fr: "Autonomie complète de lecture.", desc_en: "Full reading autonomy.", desc_it: "Piena autonomia di lettura." },
];

function levelTitle(level) {
  const lang = STATE.settings.language || "fr";
  return level["title_" + lang] || level.title_fr;
}
function levelDesc(level) {
  const lang = STATE.settings.language || "fr";
  return level["desc_" + lang] || level.desc_fr;
}

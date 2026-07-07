// =============================================================================
// quran.js — Parcours de MÉMORISATION du Coran (30 Ajza').
//
// Ce parcours est totalement INDÉPENDANT des 13 séances de lecture arabe
// (sessions.js). Il ne s'ouvre dans le profil d'un élève que lorsque
// l'enseignante en décide ainsi, après l'évaluation finale de lecture
// (voir la décision "trackDecision" sur le profil élève, gérée dans
// app.js). La progression (validation de chaque Juz) est toujours
// manuelle : c'est l'enseignante qui coche un Juz comme "mémorisé et
// validé", jamais l'application automatiquement.
//
// Noms traditionnels des 30 Ajza' (premiers mots de chaque Juz — la
// convention la plus répandue). name_ar s'affiche dans l'app (rendu
// correct en HTML/CSS) ; name_fr (translittération) est utilisé partout,
// y compris sur les diplômes PDF, où l'écriture arabe n'est pas fiable
// à générer (voir limite technique du générateur de PDF).
// =============================================================================

const JUZ_LIST = [
  { id: 1,  name_ar: "الم",              name_fr: "Alif Lām Mīm",      name_plain: "Alif Lam Mim" },
  { id: 2,  name_ar: "سيقول",            name_fr: "Sayaqūl",           name_plain: "Sayaqul" },
  { id: 3,  name_ar: "تلك الرسل",        name_fr: "Tilka'r-Rusul",     name_plain: "Tilka'r-Rusul" },
  { id: 4,  name_ar: "لن تنالوا",        name_fr: "Lan Tanālū",        name_plain: "Lan Tanalu" },
  { id: 5,  name_ar: "والمحصنات",       name_fr: "Wal-Muḥṣanāt",      name_plain: "Wal-Muhsanat" },
  { id: 6,  name_ar: "لا يحب الله",      name_fr: "Lā Yuḥibbullāh",    name_plain: "La Yuhibbullah" },
  { id: 7,  name_ar: "وإذا سمعوا",      name_fr: "Wa Idhā Samiʿū",    name_plain: "Wa Idha Sami'u" },
  { id: 8,  name_ar: "ولو أننا",         name_fr: "Wa Lau Annanā",     name_plain: "Wa Lau Annana" },
  { id: 9,  name_ar: "قال الملأ",        name_fr: "Qālal Mala'u",      name_plain: "Qalal Mala'u" },
  { id: 10, name_ar: "واعلموا",          name_fr: "Wa'lamū",           name_plain: "Wa'lamu" },
  { id: 11, name_ar: "يعتذرون",          name_fr: "Ya'tadhirūn",       name_plain: "Ya'tadhirun" },
  { id: 12, name_ar: "وما من دابة",      name_fr: "Wa Mā Min Dābbah",  name_plain: "Wa Ma Min Dabbah" },
  { id: 13, name_ar: "وما أبرئ",         name_fr: "Wa Mā Ubarri'u",    name_plain: "Wa Ma Ubarri'u" },
  { id: 14, name_ar: "ربما",             name_fr: "Rubamā",            name_plain: "Rubama" },
  { id: 15, name_ar: "سبحان الذي",       name_fr: "Subḥānalladhī",     name_plain: "Subhanalladhi" },
  { id: 16, name_ar: "قال ألم",          name_fr: "Qāl Alam",          name_plain: "Qal Alam" },
  { id: 17, name_ar: "اقترب",            name_fr: "Iqtaraba",          name_plain: "Iqtaraba" },
  { id: 18, name_ar: "قد أفلح",          name_fr: "Qad Aflaḥa",        name_plain: "Qad Aflaha" },
  { id: 19, name_ar: "وقال الذين",       name_fr: "Wa Qālalladhīna",   name_plain: "Wa Qalalladhina" },
  { id: 20, name_ar: "أمن خلق",          name_fr: "Amman Khalaq",      name_plain: "Amman Khalaq" },
  { id: 21, name_ar: "اتل ما أوحي",      name_fr: "Utlu Mā Ūḥiya",     name_plain: "Utlu Ma Uhiya" },
  { id: 22, name_ar: "ومن يقنت",         name_fr: "Wa Man Yaqnut",     name_plain: "Wa Man Yaqnut" },
  { id: 23, name_ar: "وما لي",           name_fr: "Wa Mālī",           name_plain: "Wa Mali" },
  { id: 24, name_ar: "فمن أظلم",         name_fr: "Faman Aẓlam",       name_plain: "Faman Adhlam" },
  { id: 25, name_ar: "إليه يرد",         name_fr: "Ilayhi Yuraddu",    name_plain: "Ilayhi Yuraddu" },
  { id: 26, name_ar: "حم",               name_fr: "Ḥā Mīm",            name_plain: "Ha Mim" },
  { id: 27, name_ar: "قال فما خطبكم",    name_fr: "Qāla Famā Khaṭbukum", name_plain: "Qala Fama Khatbukum" },
  { id: 28, name_ar: "قد سمع",           name_fr: "Qad Samiʿa",        name_plain: "Qad Sami'a" },
  { id: 29, name_ar: "تبارك",            name_fr: "Tabāraka",          name_plain: "Tabaraka" },
  { id: 30, name_ar: "عم",               name_fr: "ʿAmma",             name_plain: "Amma" },
];

function juzLabel(juz) {
  return `Juz' ${juz.name_fr}`;
}
// Version sans caractères spéciaux (macrons, lettres modificatives) —
// à utiliser pour tout texte généré en PDF, la police standard de jsPDF
// ne sachant pas afficher correctement ā/ī/ʿ/ʾ (voir bug corrigé : la
// pastille du diplôme affichait "¿Amm" au lieu de "'Amma").
function juzLabelPlain(juz) {
  return `Juz' ${juz.name_plain}`;
}

// =============================================================================
// discover.js — Espace public "Futurs parents / Découvrir Seyda Zeynab
// Academy". Accessible SANS profil élève (page publique partageable par
// lien WhatsApp). Le contenu (présentation, matières, forfaits, horaires,
// règlement, FAQ) est modifiable par l'enseignante depuis Réglages, dans
// les 4 langues (FR/EN/IT/AR) — les textes ci-dessous sont des traductions
// de départ à relire/adapter. Les tarifs sont désormais définis PAR PAYS
// (Sénégal/France/États-Unis/Italie), également modifiables sans toucher
// au code.
// =============================================================================

// Langues et pays pris en charge par l'espace public.
const DISCOVER_LANGS = ["fr", "en", "it", "ar"];
const DISCOVER_COUNTRIES = ["SN", "FR", "US", "IT"];

function defaultDiscoverContent() {
  return {
    description: {
      fr: "Seyda Zeynab Academy est une académie coranique en ligne qui accompagne enfants et adultes, pas à pas, de la découverte de l'alphabet arabe jusqu'à la lecture fluide et la mémorisation du Noble Coran, dans un cadre bienveillant et structuré.",
      en: "Seyda Zeynab Academy is an online Qur'anic academy that guides children and adults, step by step, from discovering the Arabic alphabet to fluent reading and memorization of the Noble Qur'an, in a caring and structured environment.",
      it: "Seyda Zeynab Academy è un'accademia coranica online che accompagna bambini e adulti, passo dopo passo, dalla scoperta dell'alfabeto arabo fino alla lettura fluente e alla memorizzazione del Nobile Corano, in un ambiente premuroso e strutturato.",
      ar: "أكاديمية سيدة زينب هي أكاديمية قرآنية عبر الإنترنت ترافق الأطفال والكبار، خطوة بخطوة، من اكتشاف الحروف العربية إلى القراءة الطليقة وحفظ القرآن الكريم، في جو من الرعاية والتنظيم.",
    },
    subjects: {
      fr: ["Lecture arabe (alphabet, voyelles, Tajwid)", "Mémorisation du Coran (Ajza')", "Athkars (invocations quotidiennes)", "Fiqh (pratique religieuse)"],
      en: ["Arabic reading (alphabet, vowels, Tajwid)", "Qur'an memorization (Ajza')", "Athkars (daily invocations)", "Fiqh (religious practice)"],
      it: ["Lettura araba (alfabeto, vocali, Tajwid)", "Memorizzazione del Corano (Ajza')", "Athkar (invocazioni quotidiane)", "Fiqh (pratica religiosa)"],
      ar: ["القراءة العربية (الحروف، الحركات، التجويد)", "حفظ القرآن (الأجزاء)", "الأذكار (الأذكار اليومية)", "الفقه (الممارسة الدينية)"],
    },
    courseFlow: {
      fr: "Chaque séance dure environ 1h et combine plusieurs matières (Coran, Athkars, Fiqh, exercices, évaluation). Les cours se déroulent en ligne, en petit groupe ou en individuel, selon un emploi du temps fixé avec l'enseignante. La progression de l'élève est suivie séance par séance, avec des diplômes à chaque étape franchie.",
      en: "Each session lasts about 1 hour and combines several subjects (Qur'an, Athkars, Fiqh, exercises, assessment). Classes take place online, in small groups or one-on-one, according to a schedule set with the teacher. The student's progress is tracked session by session, with diplomas awarded at each milestone.",
      it: "Ogni sessione dura circa 1 ora e combina diverse materie (Corano, Athkar, Fiqh, esercizi, valutazione). Le lezioni si svolgono online, in piccoli gruppi o individualmente, secondo un orario concordato con l'insegnante. I progressi dello studente vengono seguiti sessione dopo sessione, con diplomi assegnati a ogni traguardo raggiunto.",
      ar: "تستغرق كل حصة حوالي ساعة وتجمع بين عدة مواد (القرآن، الأذكار، الفقه، التمارين، التقييم). تُقام الدروس عبر الإنترنت، في مجموعات صغيرة أو بشكل فردي، وفق جدول زمني يُحدَّد مع المعلمة. تُتابع مسيرة الطالب حصة بحصة، مع منح الشهادات عند كل مرحلة يتم اجتيازها.",
    },
    rules: {
      fr: ["Assiduité aux séances prévues ; prévenir en cas d'absence.", "Respect mutuel entre élèves et enseignante.", "Paiement mensuel à la date convenue avec l'enseignante.", "Tenue et cadre calme recommandés pendant les cours en ligne."],
      en: ["Regular attendance at scheduled sessions; notify in advance in case of absence.", "Mutual respect between students and teacher.", "Monthly payment on the date agreed with the teacher.", "A quiet setting and appropriate attire are recommended during online classes."],
      it: ["Frequenza regolare alle sessioni previste; avvisare in caso di assenza.", "Rispetto reciproco tra studenti e insegnante.", "Pagamento mensile alla data concordata con l'insegnante.", "Si raccomanda un abbigliamento adeguato e un ambiente tranquillo durante le lezioni online."],
      ar: ["الحضور المنتظم للحصص المقررة؛ يُرجى الإخطار المسبق في حال الغياب.", "الاحترام المتبادل بين الطلاب والمعلمة.", "الدفع الشهري في التاريخ المتفق عليه مع المعلمة.", "يُنصح بلباس محتشم وجو هادئ أثناء الدروس عبر الإنترنت."],
    },
    scheduleSlots: {
      fr: [{ label: "Lundi/Mercredi 17h-18h", available: true }, { label: "Mardi/Jeudi 18h-19h", available: true }, { label: "Samedi 10h-12h", available: true }],
      en: [{ label: "Monday/Wednesday 5-6 PM", available: true }, { label: "Tuesday/Thursday 6-7 PM", available: true }, { label: "Saturday 10 AM-12 PM", available: true }],
      it: [{ label: "Lunedì/Mercoledì 17-18", available: true }, { label: "Martedì/Giovedì 18-19", available: true }, { label: "Sabato 10-12", available: true }],
      ar: [{ label: "الإثنين/الأربعاء 17:00-18:00", available: true }, { label: "الثلاثاء/الخميس 18:00-19:00", available: true }, { label: "السبت 10:00-12:00", available: true }],
    },
    faq: {
      fr: [
        { q: "À partir de quel âge peut-on commencer ?", a: "Dès 5-6 ans pour les enfants ; aucune limite d'âge pour les adultes débutants." },
        { q: "Faut-il déjà savoir lire l'arabe ?", a: "Non, l'académie accompagne les élèves depuis la découverte des lettres arabes." },
        { q: "Les cours sont-ils en ligne ou en présentiel ?", a: "Les cours se déroulent en ligne, via visioconférence." },
        { q: "Comment se fait le paiement ?", a: "Mensuellement, selon le forfait choisi, par Wave, Orange Money ou virement." },
      ],
      en: [
        { q: "From what age can a child start?", a: "From 5-6 years old for children; no age limit for beginner adults." },
        { q: "Does the student need to already read Arabic?", a: "No, the academy guides students from the very discovery of the Arabic letters." },
        { q: "Are classes online or in person?", a: "Classes take place online, via video call." },
        { q: "How does payment work?", a: "Monthly, according to the chosen plan, via Wave, Orange Money, or bank transfer." },
      ],
      it: [
        { q: "A partire da quale età si può iniziare?", a: "Dai 5-6 anni per i bambini; nessun limite di età per gli adulti principianti." },
        { q: "Bisogna già saper leggere l'arabo?", a: "No, l'accademia accompagna gli studenti fin dalla scoperta delle lettere arabe." },
        { q: "Le lezioni sono online o in presenza?", a: "Le lezioni si svolgono online, tramite videochiamata." },
        { q: "Come avviene il pagamento?", a: "Mensilmente, in base al piano scelto, tramite Wave, Orange Money o bonifico." },
      ],
      ar: [
        { q: "من أي سن يمكن البدء؟", a: "ابتداءً من 5-6 سنوات للأطفال؛ لا يوجد حد أدنى للسن بالنسبة للكبار المبتدئين." },
        { q: "هل يجب معرفة القراءة بالعربية مسبقًا؟", a: "لا، ترافق الأكاديمية الطلاب منذ اكتشاف الحروف العربية." },
        { q: "هل الدروس عبر الإنترنت أم حضوريًا؟", a: "تُقام الدروس عبر الإنترنت، من خلال مكالمة فيديو." },
        { q: "كيف يتم الدفع؟", a: "شهريًا، حسب الباقة المختارة، عبر Wave أو Orange Money أو التحويل البنكي." },
      ],
    },
    // Tarifs PAR PAYS. Les noms/descriptions des formules sont écrits par
    // l'enseignante (en français ou dans la langue de son choix) et ne sont
    // PAS traduits automatiquement — contrairement au reste (présentation,
    // règlement, FAQ...) qui suit la langue choisie par le visiteur. Montants
    // à titre d'exemple : à vérifier/ajuster, notamment pour la France, les
    // États-Unis et l'Italie.
    countries: {
      SN: {
        label: "Sénégal", currency: "FCFA",
        plans: [
          { name: "Formule individuelle", amount: "15000", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule familiale", amount: "25000", frequency: "par mois", description: "Pour 2 enfants ou plus de la même famille." },
        ],
      },
      FR: {
        label: "France", currency: "€",
        plans: [
          { name: "Formule individuelle", amount: "40", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule familiale", amount: "65", frequency: "par mois", description: "Pour 2 enfants ou plus de la même famille." },
        ],
      },
      US: {
        label: "États-Unis", currency: "$",
        plans: [
          { name: "Formule individuelle", amount: "45", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule familiale", amount: "70", frequency: "par mois", description: "Pour 2 enfants ou plus de la même famille." },
        ],
      },
      IT: {
        label: "Italie", currency: "€",
        plans: [
          { name: "Formule individuelle", amount: "40", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule familiale", amount: "65", frequency: "par mois", description: "Pour 2 enfants ou plus de la même famille." },
        ],
      },
    },
  };
}

const DISCOVER_LABELS = {
  fr: {
    heroTagline: "Apprendre le Coran, pas à pas, où que vous soyez",
    sectionAbout: "Présentation", sectionSubjects: "Matières enseignées",
    sectionFlow: "Déroulement des cours", sectionPlans: "Forfaits & tarifs",
    sectionSchedule: "Emplois du temps disponibles", sectionRules: "Règlement de l'académie",
    sectionFaq: "Questions fréquentes", ctaRegister: "S'inscrire",
    formTitle: "Formulaire d'inscription", childName: "Nom de l'enfant / élève",
    childAge: "Âge", parentName: "Nom du parent / tuteur", parentPhone: "Téléphone / WhatsApp",
    parentEmail: "E-mail (facultatif)", desiredPlan: "Forfait souhaité", desiredSlot: "Créneau souhaité",
    message: "Message (facultatif)", submitRegistration: "Envoyer la demande",
    registrationSent: "Demande envoyée !", registrationSentMsg: "Votre demande a bien été enregistrée. L'académie vous recontactera rapidement.",
    shareViaWhatsapp: "Partager par WhatsApp", copyLink: "Copier le lien",
    linkCopied: "Lien copié", chooseCountry: "Votre pays",
  },
  en: {
    heroTagline: "Learn the Qur'an, step by step, wherever you are",
    sectionAbout: "About", sectionSubjects: "Subjects taught",
    sectionFlow: "How classes work", sectionPlans: "Plans & pricing",
    sectionSchedule: "Available schedules", sectionRules: "Academy rules",
    sectionFaq: "Frequently asked questions", ctaRegister: "Register",
    formTitle: "Registration form", childName: "Child's / student's name",
    childAge: "Age", parentName: "Parent / guardian's name", parentPhone: "Phone / WhatsApp",
    parentEmail: "Email (optional)", desiredPlan: "Desired plan", desiredSlot: "Desired schedule",
    message: "Message (optional)", submitRegistration: "Send request",
    registrationSent: "Request sent!", registrationSentMsg: "Your request has been recorded. The academy will contact you soon.",
    shareViaWhatsapp: "Share via WhatsApp", copyLink: "Copy link",
    linkCopied: "Link copied", chooseCountry: "Your country",
  },
  it: {
    heroTagline: "Imparare il Corano, passo dopo passo, ovunque tu sia",
    sectionAbout: "Presentazione", sectionSubjects: "Materie insegnate",
    sectionFlow: "Come si svolgono i corsi", sectionPlans: "Piani e tariffe",
    sectionSchedule: "Orari disponibili", sectionRules: "Regolamento dell'accademia",
    sectionFaq: "Domande frequenti", ctaRegister: "Iscriviti",
    formTitle: "Modulo di iscrizione", childName: "Nome del bambino / studente",
    childAge: "Età", parentName: "Nome del genitore / tutore", parentPhone: "Telefono / WhatsApp",
    parentEmail: "Email (facoltativo)", desiredPlan: "Piano desiderato", desiredSlot: "Orario desiderato",
    message: "Messaggio (facoltativo)", submitRegistration: "Invia richiesta",
    registrationSent: "Richiesta inviata!", registrationSentMsg: "La tua richiesta è stata registrata. L'accademia ti contatterà presto.",
    shareViaWhatsapp: "Condividi su WhatsApp", copyLink: "Copia link",
    linkCopied: "Link copiato", chooseCountry: "Il tuo paese",
  },
  ar: {
    heroTagline: "تعلَّم القرآن خطوة بخطوة، أينما كنت",
    sectionAbout: "التعريف بالأكاديمية", sectionSubjects: "المواد المُدرَّسة",
    sectionFlow: "سير الدروس", sectionPlans: "الباقات والأسعار",
    sectionSchedule: "الأوقات المتاحة", sectionRules: "نظام الأكاديمية",
    sectionFaq: "الأسئلة الشائعة", ctaRegister: "التسجيل",
    formTitle: "استمارة التسجيل", childName: "اسم الطفل / الطالب",
    childAge: "العمر", parentName: "اسم ولي الأمر", parentPhone: "الهاتف / واتساب",
    parentEmail: "البريد الإلكتروني (اختياري)", desiredPlan: "الباقة المطلوبة", desiredSlot: "الوقت المطلوب",
    message: "رسالة (اختياري)", submitRegistration: "إرسال الطلب",
    registrationSent: "تم إرسال الطلب!", registrationSentMsg: "تم تسجيل طلبكم بنجاح. ستتواصل معكم الأكاديمية قريبًا.",
    shareViaWhatsapp: "مشاركة عبر واتساب", copyLink: "نسخ الرابط",
    linkCopied: "تم نسخ الرابط", chooseCountry: "بلدك",
  },
};

// dt(key, langOverride) : par défaut suit la langue de l'interface de
// l'enseignante (Réglages) ; sur la page publique, on passe explicitement
// la langue choisie par le VISITEUR (indépendante des réglages internes).
function dt(key, langOverride) {
  const lang = langOverride || STATE.settings.language || "fr";
  return (DISCOVER_LABELS[lang] || DISCOVER_LABELS.fr)[key] || key;
}

// Devine la langue du visiteur à partir de la langue du navigateur.
function guessDiscoverLang() {
  const nav = ((navigator.language || navigator.userLanguage || "fr") + "").slice(0, 2).toLowerCase();
  return DISCOVER_LANGS.includes(nav) ? nav : "fr";
}

// Devine le pays du visiteur à partir de son fuseau horaire (simple table
// de correspondance couvrant les 4 pays configurés). Modifiable en un tap
// par le visiteur si la détection est incorrecte.
function guessDiscoverCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/^Africa\//.test(tz) || tz === "Africa/Dakar") return "SN";
    if (tz === "Europe/Paris") return "FR";
    if (tz === "Europe/Rome") return "IT";
    if (/^America\//.test(tz)) return "US";
  } catch (e) { /* ignore */ }
  return "SN";
}

function buildWhatsAppRegistrationMessage(reg, academyName) {
  const lines = [
    `📋 Nouvelle demande d'inscription — ${academyName}`,
    ``,
    `👤 Élève : ${reg.childName} (${reg.childAge} ans)`,
    `👪 Parent/tuteur : ${reg.parentName}`,
    `📞 Contact : ${reg.parentPhone}`,
    reg.parentEmail ? `✉️ E-mail : ${reg.parentEmail}` : null,
    reg.desiredPlan ? `💳 Forfait souhaité : ${reg.desiredPlan}` : null,
    reg.desiredSlot ? `🗓️ Créneau souhaité : ${reg.desiredSlot}` : null,
    reg.message ? `📝 Message : ${reg.message}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function whatsappLink(phone, text) {
  const digits = (phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

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
      ar: "أكاديمية سيدة زينب أكاديميةٌ قرآنية تعليميةٌ عبر الإنترنت، تحتضن الأطفال والكبار على حدٍّ سواء، وتأخذ بأيديهم خطوةً بخطوة؛ بدءًا من تعلّم الحروف العربية، مرورًا بإتقان القراءة الصحيحة المجوَّدة، وصولًا إلى حفظ كتاب الله الكريم، في بيئةٍ تربويةٍ هادئة ومنظَّمة وحاضنة.",
    },
    subjects: {
      fr: ["Lecture arabe (alphabet, voyelles, Tajwid)", "Mémorisation du Coran (Ajza')", "Tafsir (exégèse du Coran)", "Athkars (invocations quotidiennes)", "Fiqh (pratique religieuse)"],
      en: ["Arabic reading (alphabet, vowels, Tajwid)", "Qur'an memorization (Ajza')", "Tafsir (Qur'anic exegesis)", "Athkars (daily invocations)", "Fiqh (religious practice)"],
      it: ["Lettura araba (alfabeto, vocali, Tajwid)", "Memorizzazione del Corano (Ajza')", "Tafsir (esegesi coranica)", "Athkar (invocazioni quotidiane)", "Fiqh (pratica religiosa)"],
      ar: ["القراءة العربية (الحروف، الحركات، التجويد)", "حفظ القرآن الكريم", "التفسير", "الأذكار اليومية", "الفقه الإسلامي"],
    },
    courseFlow: {
      fr: "Chaque séance dure environ 1h et combine plusieurs matières (Coran, Athkars, Fiqh, exercices, évaluation). Les cours se déroulent en ligne, en petit groupe ou en individuel, selon un emploi du temps fixé avec l'enseignante. La progression de l'élève est suivie séance par séance, avec des diplômes à chaque étape franchie.",
      en: "Each session lasts about 1 hour and combines several subjects (Qur'an, Athkars, Fiqh, exercises, assessment). Classes take place online, in small groups or one-on-one, according to a schedule set with the teacher. The student's progress is tracked session by session, with diplomas awarded at each milestone.",
      it: "Ogni sessione dura circa 1 ora e combina diverse materie (Corano, Athkar, Fiqh, esercizi, valutazione). Le lezioni si svolgono online, in piccoli gruppi o individualmente, secondo un orario concordato con l'insegnante. I progressi dello studente vengono seguiti sessione dopo sessione, con diplomi assegnati a ogni traguardo raggiunto.",
      ar: "تمتد كل حصةٍ قرابة ساعةٍ من الزمن، وتجمع بين عددٍ من المواد كالقرآن الكريم والأذكار والفقه والتطبيقات والتقييم. وتُقام الدروس عبر الإنترنت، إمّا ضمن مجموعاتٍ صغيرة أو بشكل فردي، وفق جدولٍ زمنيٍّ يُتَّفق عليه مسبقًا مع المعلّمة. وتُتابَع مسيرة كل طالبٍ حصةً بحصة، وتُمنح الشهادات تكريمًا له عند اجتيازه كل مرحلةٍ من مراحل التعلّم.",
    },
    rules: {
      fr: ["Assiduité aux séances prévues ; prévenir en cas d'absence.", "Respect mutuel entre élèves et enseignante.", "Paiement mensuel à la date convenue avec l'enseignante.", "Tenue et cadre calme recommandés pendant les cours en ligne."],
      en: ["Regular attendance at scheduled sessions; notify in advance in case of absence.", "Mutual respect between students and teacher.", "Monthly payment on the date agreed with the teacher.", "A quiet setting and appropriate attire are recommended during online classes."],
      it: ["Frequenza regolare alle sessioni previste; avvisare in caso di assenza.", "Rispetto reciproco tra studenti e insegnante.", "Pagamento mensile alla data concordata con l'insegnante.", "Si raccomanda un abbigliamento adeguato e un ambiente tranquillo durante le lezioni online."],
      ar: ["المواظبة على حضور الحصص المقررة، مع ضرورة الإخطار المسبق عند التغيّب.", "الاحترام المتبادل بين الطالب والمعلّمة.", "سداد الرسوم الشهرية في الموعد المتَّفق عليه مع المعلّمة.", "يُستحسن ارتداء لباسٍ محتشم، والحرص على أجواءٍ هادئة أثناء الحصص عبر الإنترنت."],
    },
    scheduleSlots: {
      fr: [{ label: "Du lundi au dimanche, entre 8h et 21h", available: true }, { label: "Le jour et l'horaire exacts sont fixés avec l'enseignante après l'inscription, selon les disponibilités.", available: true }],
      en: [{ label: "Monday to Sunday, between 8 AM and 9 PM", available: true }, { label: "The exact day and time are set with the teacher after registration, based on availability.", available: true }],
      it: [{ label: "Da lunedì a domenica, tra le 8 e le 21", available: true }, { label: "Il giorno e l'orario esatti vengono fissati con l'insegnante dopo l'iscrizione, in base alle disponibilità.", available: true }],
      ar: [{ label: "من الإثنين إلى الأحد، بين الساعة الثامنة صباحًا والتاسعة مساءً", available: true }, { label: "يُحدَّد اليوم والموعد المناسبان مع المعلّمة بعد التسجيل، وفق التوفّر.", available: true }],
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
        { q: "من أي سنٍّ يمكن الالتحاق بالأكاديمية؟", a: "اعتبارًا من سنّ الخامسة أو السادسة بالنسبة للأطفال، ولا حدّ أقصى للسنّ بالنسبة للكبار المبتدئين." },
        { q: "هل يُشترط إتقان القراءة بالعربية مسبقًا؟", a: "لا، فالأكاديمية ترافق الطالب منذ خطواته الأولى، بدءًا من تعلّم الحروف العربية." },
        { q: "هل الدروس حضورية أم عن بُعد؟", a: "تُقام جميع الدروس عن بُعد، عبر مكالمات الفيديو." },
        { q: "كيف تتم عملية الدفع؟", a: "يتم الدفع شهريًا، حسب الباقة المختارة، عبر خدمتَي Wave أو Orange Money، أو عن طريق التحويل البنكي." },
      ],
    },
    // Tarifs PAR PAYS — tarifs réels de l'académie (en FCFA pour les 4
    // pays, l'académie facturant tous les paiements internationaux en
    // francs CFA). Ces valeurs sont écrites directement ici pour
    // s'afficher chez TOUS les visiteurs (voir note d'architecture : les
    // modifications faites depuis Réglages → "Modifier les tarifs par
    // pays" ne s'appliquent que sur l'appareil de l'enseignante).
    countries: {
      SN: {
        label: "Sénégal", currency: "FCFA",
        plans: [
          { name: "Formule individuelle", amount: "20000", frequency: "par mois", description: "Cours particuliers, 3 séances par semaine." },
          { name: "Formule individuelle", amount: "15000", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule individuelle", amount: "10000", frequency: "par mois", description: "Cours particuliers, 1 séance par semaine." },
          { name: "Formule familiale", amount: "50000", frequency: "par mois", description: "À partir de 3 enfants de la même famille, 3 séances par semaine." },
        ],
      },
      FR: {
        label: "France", currency: "FCFA",
        plans: [
          { name: "Formule individuelle", amount: "25000", frequency: "par mois", description: "Cours particuliers, 3 séances par semaine." },
          { name: "Formule individuelle", amount: "20000", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule individuelle", amount: "15000", frequency: "par mois", description: "Cours particuliers, 1 séance par semaine." },
        ],
      },
      US: {
        label: "États-Unis", currency: "FCFA",
        plans: [
          { name: "Formule individuelle", amount: "25000", frequency: "par mois", description: "Cours particuliers, 3 séances par semaine." },
          { name: "Formule individuelle", amount: "20000", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule individuelle", amount: "15000", frequency: "par mois", description: "Cours particuliers, 1 séance par semaine." },
        ],
      },
      IT: {
        label: "Italie", currency: "FCFA",
        plans: [
          { name: "Formule individuelle", amount: "25000", frequency: "par mois", description: "Cours particuliers, 3 séances par semaine." },
          { name: "Formule individuelle", amount: "20000", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
          { name: "Formule individuelle", amount: "15000", frequency: "par mois", description: "Cours particuliers, 1 séance par semaine." },
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
    registrationSent: "Demande envoyée !", registrationSentMsg: "Pour que votre demande arrive bien à l'académie, merci de confirmer via le bouton WhatsApp ci-dessous.",
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
    registrationSent: "Request sent!", registrationSentMsg: "To make sure your request reaches the academy, please confirm via the WhatsApp button below.",
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
    registrationSent: "Richiesta inviata!", registrationSentMsg: "Per essere certi che la vostra richiesta arrivi all'accademia, confermate tramite il pulsante WhatsApp qui sotto.",
    shareViaWhatsapp: "Condividi su WhatsApp", copyLink: "Copia link",
    linkCopied: "Link copiato", chooseCountry: "Il tuo paese",
  },
  ar: {
    heroTagline: "تعلّم القرآن الكريم خطوة بخطوة، أينما كنت",
    sectionAbout: "نبذة عن الأكاديمية", sectionSubjects: "المواد الدراسية",
    sectionFlow: "سير الدروس", sectionPlans: "الباقات والأسعار",
    sectionSchedule: "المواعيد المتاحة", sectionRules: "نظام الأكاديمية",
    sectionFaq: "الأسئلة الشائعة", ctaRegister: "سجِّل الآن",
    formTitle: "استمارة التسجيل", childName: "اسم الطفل / الطالب",
    childAge: "العمر", parentName: "اسم ولي الأمر", parentPhone: "الهاتف / واتساب",
    parentEmail: "البريد الإلكتروني (اختياري)", desiredPlan: "الباقة المطلوبة", desiredSlot: "الموعد المفضَّل",
    message: "ملاحظات إضافية (اختياري)", submitRegistration: "إرسال الطلب",
    registrationSent: "تم إرسال الطلب!", registrationSentMsg: "للتأكد من وصول طلبكم، يُرجى تأكيده عبر زر واتساب أدناه.",
    shareViaWhatsapp: "مشاركة عبر واتساب", copyLink: "نسخ الرابط",
    linkCopied: "تم نسخ الرابط", chooseCountry: "بلدكم",
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

// Migre un ancien réglage "discover" (structure à plat, une seule langue,
// un seul tarif) vers la nouvelle structure multilingue + tarifs par pays
// — sans rien perdre de ce que l'enseignante avait déjà personnalisé.
// Sans cette migration, une ancienne sauvegarde faisait planter silencieu-
// sement le rendu de la page publique et de ses écrans d'édition.
function migrateDiscoverContent(saved) {
  const base = defaultDiscoverContent();
  if (!saved || typeof saved !== "object") return base;
  const isOldShape = typeof saved.description === "string" || Array.isArray(saved.plans);
  if (!isOldShape) {
    // Déjà au nouveau format : on complète juste les langues/pays qui
    // manqueraient encore (ex. après un ajout futur), sans rien écraser.
    return {
      description: { ...base.description, ...(saved.description || {}) },
      subjects: { ...base.subjects, ...(saved.subjects || {}) },
      courseFlow: { ...base.courseFlow, ...(saved.courseFlow || {}) },
      rules: { ...base.rules, ...(saved.rules || {}) },
      scheduleSlots: { ...base.scheduleSlots, ...(saved.scheduleSlots || {}) },
      faq: { ...base.faq, ...(saved.faq || {}) },
      countries: { ...base.countries, ...(saved.countries || {}) },
    };
  }
  // Ancien format à plat (une seule langue, en français) : réinjecté comme
  // contenu FRANÇAIS ; EN/IT/AR gardent les traductions par défaut en
  // attendant relecture.
  return {
    description: { ...base.description, fr: saved.description || base.description.fr },
    subjects: { ...base.subjects, fr: (saved.subjects && saved.subjects.length) ? saved.subjects : base.subjects.fr },
    courseFlow: { ...base.courseFlow, fr: saved.courseFlow || base.courseFlow.fr },
    rules: { ...base.rules, fr: (saved.rules && saved.rules.length) ? saved.rules : base.rules.fr },
    scheduleSlots: { ...base.scheduleSlots, fr: (saved.scheduleSlots && saved.scheduleSlots.length) ? saved.scheduleSlots : base.scheduleSlots.fr },
    faq: { ...base.faq, fr: (saved.faq && saved.faq.length) ? saved.faq : base.faq.fr },
    countries: (saved.plans && saved.plans.length)
      ? { ...base.countries, SN: { label: "Sénégal", currency: saved.plans[0]?.currency || "FCFA", plans: saved.plans.map((p) => ({ name: p.name, amount: p.amount, frequency: p.frequency, description: p.description })) } }
      : base.countries,
  };
}

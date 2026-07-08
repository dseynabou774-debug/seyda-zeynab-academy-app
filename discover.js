// =============================================================================
// discover.js — Espace public "Futurs parents / Découvrir Seyda Zeynab
// Academy". Accessible SANS profil élève (page publique partageable par
// lien WhatsApp). Le contenu (présentation, matières, forfaits, horaires,
// règlement, FAQ) est modifiable par l'enseignante depuis Réglages — les
// textes ci-dessous ne sont que des exemples de départ à adapter.
// =============================================================================

function defaultDiscoverContent() {
  return {
    description:
      "Seyda Zeynab Academy est une académie coranique en ligne qui accompagne enfants et adultes, pas à pas, de la découverte de l'alphabet arabe jusqu'à la lecture fluide et la mémorisation du Noble Coran, dans un cadre bienveillant et structuré.",
    subjects: [
      "Lecture arabe (alphabet, voyelles, Tajwid)",
      "Mémorisation du Coran (Ajza')",
      "Athkars (invocations quotidiennes)",
      "Fiqh (pratique religieuse)",
    ],
    courseFlow:
      "Chaque séance dure environ 1h et combine plusieurs matières (Coran, Athkars, Fiqh, exercices, évaluation). Les cours se déroulent en ligne, en petit groupe ou en individuel, selon un emploi du temps fixé avec l'enseignante. La progression de l'élève est suivie séance par séance, avec des diplômes à chaque étape franchie.",
    plans: [
      { name: "Formule individuelle", amount: "15000", currency: "FCFA", frequency: "par mois", description: "Cours particuliers, 2 séances par semaine." },
      { name: "Formule familiale", amount: "25000", currency: "FCFA", frequency: "par mois", description: "Pour 2 enfants ou plus de la même famille." },
    ],
    scheduleSlots: [
      { label: "Lundi/Mercredi 17h-18h", available: true },
      { label: "Mardi/Jeudi 18h-19h", available: true },
      { label: "Samedi 10h-12h", available: true },
    ],
    rules: [
      "Assiduité aux séances prévues ; prévenir en cas d'absence.",
      "Respect mutuel entre élèves et enseignante.",
      "Paiement mensuel à la date convenue avec l'enseignante.",
      "Tenue et cadre calme recommandés pendant les cours en ligne.",
    ],
    faq: [
      { q: "À partir de quel âge peut-on commencer ?", a: "Dès 5-6 ans pour les enfants ; aucune limite d'âge pour les adultes débutants." },
      { q: "Faut-il déjà savoir lire l'arabe ?", a: "Non, l'académie accompagne les élèves depuis la découverte des lettres arabes." },
      { q: "Les cours sont-ils en ligne ou en présentiel ?", a: "Les cours se déroulent en ligne, via visioconférence." },
      { q: "Comment se fait le paiement ?", a: "Mensuellement, selon le forfait choisi, par Wave, Orange Money ou virement." },
    ],
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
    linkCopied: "Lien copié",
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
    linkCopied: "Link copied",
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
    linkCopied: "Link copiato",
  },
};
function dt(key) {
  const lang = STATE.settings.language || "fr";
  return (DISCOVER_LABELS[lang] || DISCOVER_LABELS.fr)[key] || key;
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

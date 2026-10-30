export type ApplicationCategory = "bank" | "school" | "government";
export type ApplicationLanguage = "en" | "bn";

export interface ApplicationContent {
  subject: string;
  body: string;
}

export interface ApplicationPurpose {
  id: string;
  label: Record<ApplicationLanguage, string>;
  subject: Record<ApplicationLanguage, string>;
  opening: Record<ApplicationLanguage, string>;
  request: Record<ApplicationLanguage, string>;
}

export interface ApplicationDraftInput {
  language: ApplicationLanguage;
  category: ApplicationCategory;
  purposeId: string;
  applicantName: string;
  details: string;
}

const APPLICATION_PURPOSES: Record<ApplicationCategory, ApplicationPurpose[]> = {
  bank: [
    {
      id: "statement",
      label: { en: "Bank statement", bn: "ব্যাংক স্টেটমেন্ট" },
      subject: { en: "Request for a bank account statement", bn: "ব্যাংক হিসাবের স্টেটমেন্ট প্রদানের জন্য আবেদন" },
      opening: {
        en: "I am an account holder at your bank. My account details are provided below.",
        bn: "আমি আপনার ব্যাংকের একজন হিসাবধারী। আমার হিসাবের প্রয়োজনীয় তথ্য নিচে উল্লেখ করা হলো।",
      },
      request: {
        en: "I kindly request you to provide an account statement for the required period.",
        bn: "প্রয়োজনীয় সময়ের হিসাব বিবরণী প্রদান করার জন্য আপনার সদয় সহযোগিতা কামনা করছি।",
      },
    },
    {
      id: "account-update",
      label: { en: "Update account information", bn: "হিসাবের তথ্য হালনাগাদ" },
      subject: { en: "Request to update bank account information", bn: "ব্যাংক হিসাবের তথ্য হালনাগাদের জন্য আবেদন" },
      opening: {
        en: "I am an account holder at your bank and would like to update my account information.",
        bn: "আমি আপনার ব্যাংকের একজন হিসাবধারী। আমার হিসাবের তথ্য হালনাগাদ করা প্রয়োজন।",
      },
      request: {
        en: "Please review the supporting documents and update my account information.",
        bn: "সংযুক্ত প্রমাণপত্র যাচাই করে আমার হিসাবের তথ্য হালনাগাদ করার জন্য অনুরোধ করছি।",
      },
    },
    {
      id: "account-closure",
      label: { en: "Close an account", bn: "হিসাব বন্ধ" },
      subject: { en: "Request to close a bank account", bn: "ব্যাংক হিসাব বন্ধ করার জন্য আবেদন" },
      opening: {
        en: "I am an account holder at your bank and would like to close my bank account.",
        bn: "আমি আপনার ব্যাংকের একজন হিসাবধারী এবং আমার ব্যাংক হিসাবটি বন্ধ করতে ইচ্ছুক।",
      },
      request: {
        en: "Please complete the applicable formalities and close my account.",
        bn: "প্রযোজ্য আনুষ্ঠানিকতা সম্পন্ন করে আমার হিসাবটি বন্ধ করার জন্য অনুরোধ করছি।",
      },
    },
  ],
  school: [
    {
      id: "leave",
      label: { en: "Leave of absence", bn: "ছুটির আবেদন" },
      subject: { en: "Application for leave", bn: "ছুটির জন্য আবেদন" },
      opening: {
        en: "I am a student at your institution and need to request leave for a personal reason.",
        bn: "আমি আপনার শিক্ষাপ্রতিষ্ঠানের একজন শিক্ষার্থী। বিশেষ কারণে আমার ছুটি প্রয়োজন।",
      },
      request: {
        en: "I kindly request that you consider my situation and grant leave for the period stated.",
        bn: "বিষয়টি বিবেচনা করে আমাকে উল্লিখিত সময়ের জন্য ছুটি মঞ্জুর করার অনুরোধ করছি।",
      },
    },
    {
      id: "certificate",
      label: { en: "Certificate / testimonial", bn: "প্রত্যয়নপত্র / প্রশংসাপত্র" },
      subject: { en: "Request for a certificate or testimonial", bn: "প্রত্যয়নপত্র / প্রশংসাপত্র প্রদানের জন্য আবেদন" },
      opening: {
        en: "I am a current or former student of your institution and need an official certificate or testimonial.",
        bn: "আমি আপনার শিক্ষাপ্রতিষ্ঠানের একজন শিক্ষার্থী / প্রাক্তন শিক্ষার্থী। আমার একটি প্রত্যয়নপত্র প্রয়োজন।",
      },
      request: {
        en: "Please complete the necessary verification and issue the requested certificate.",
        bn: "প্রয়োজনীয় যাচাই সম্পন্ন করে আমাকে উক্ত প্রত্যয়নপত্রটি প্রদান করার অনুরোধ করছি।",
      },
    },
    {
      id: "admission",
      label: { en: "Admission request", bn: "ভর্তির আবেদন" },
      subject: { en: "Application for admission", bn: "ভর্তির জন্য আবেদন" },
      opening: {
        en: "I am interested in applying for admission to your institution.",
        bn: "আমি আপনার শিক্ষাপ্রতিষ্ঠানে ভর্তির জন্য আবেদন করতে আগ্রহী।",
      },
      request: {
        en: "Please consider my application and let me know the next steps in the admission process.",
        bn: "আমার আবেদনটি বিবেচনা করে ভর্তি-সংক্রান্ত পরবর্তী নির্দেশনা দেওয়ার অনুরোধ করছি।",
      },
    },
  ],
  government: [
    {
      id: "certificate",
      label: { en: "Certificate / attestation", bn: "সনদ / প্রত্যয়নপত্র" },
      subject: { en: "Request for a certificate or attestation", bn: "সনদ / প্রত্যয়নপত্র প্রদানের জন্য আবেদন" },
      opening: {
        en: "I am submitting this application to request a certificate or attestation from your office.",
        bn: "আমি আপনার দপ্তরের সেবা গ্রহণের জন্য এই আবেদনটি পেশ করছি। আমার একটি সনদ / প্রত্যয়নপত্র প্রয়োজন।",
      },
      request: {
        en: "Please review the required documents and issue the requested certificate or attestation.",
        bn: "প্রয়োজনীয় কাগজপত্র যাচাই করে আমাকে উক্ত সনদ / প্রত্যয়নপত্র প্রদানের অনুরোধ করছি।",
      },
    },
    {
      id: "record-correction",
      label: { en: "Correct a record", bn: "তথ্য / রেকর্ড সংশোধন" },
      subject: { en: "Request to correct an official record", bn: "তথ্য / রেকর্ড সংশোধনের জন্য আবেদন" },
      opening: {
        en: "Some information in an official record needs to be corrected. The details are provided below.",
        bn: "আপনার দপ্তরের নথিতে আমার কিছু তথ্য সংশোধন করা প্রয়োজন। সংশোধনের বিবরণ নিচে দেওয়া হলো।",
      },
      request: {
        en: "Please review the supporting documents and make the necessary correction.",
        bn: "সংযুক্ত প্রমাণপত্র যাচাই করে প্রয়োজনীয় সংশোধন করার জন্য অনুরোধ করছি।",
      },
    },
    {
      id: "general-request",
      label: { en: "General request / assistance", bn: "সাধারণ আবেদন / সহায়তা" },
      subject: { en: "Application for assistance", bn: "প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য আবেদন" },
      opening: {
        en: "I am submitting this application for your kind consideration.",
        bn: "আমি আপনার দপ্তরের সদয় বিবেচনার জন্য এই আবেদনটি পেশ করছি।",
      },
      request: {
        en: "I kindly request you to consider the matter and take the necessary action.",
        bn: "বিষয়টি বিবেচনা করে প্রয়োজনীয় ব্যবস্থা গ্রহণ করার জন্য বিনীত অনুরোধ করছি।",
      },
    },
  ],
};

export function getApplicationPurposes(category: ApplicationCategory) {
  return APPLICATION_PURPOSES[category].map(({ id, label }) => ({ id, label: { ...label } }));
}

export function getApplicationContent(
  language: ApplicationLanguage,
  category: ApplicationCategory,
  purposeId = APPLICATION_PURPOSES[category][0].id,
): ApplicationContent {
  const purpose = APPLICATION_PURPOSES[category].find((item) => item.id === purposeId)
    ?? APPLICATION_PURPOSES[category][0];
  return {
    subject: purpose.subject[language],
    body: `${purpose.opening[language]} ${purpose.request[language]}`,
  };
}

export function createApplicationDraft(input: ApplicationDraftInput): ApplicationContent {
  const purpose = APPLICATION_PURPOSES[input.category].find((item) => item.id === input.purposeId)
    ?? APPLICATION_PURPOSES[input.category][0];
  const name = input.applicantName.trim()
    || (input.language === "bn" ? "[আপনার নাম]" : "[Your name]");
  const opening = input.language === "bn"
    ? `বিনীত নিবেদন এই যে, আমি ${name}। ${purpose.opening[input.language]}`
    : `I respectfully submit that my name is ${name}. ${purpose.opening[input.language]}`;
  const body = [opening, input.details.trim(), purpose.request[input.language]]
    .filter(Boolean)
    .join("\n\n");
  return {
    subject: purpose.subject[input.language],
    body,
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

export interface PrintableApplication {
  language: ApplicationLanguage;
  date: string;
  applicantName: string;
  applicantAddress: string;
  applicantPhone: string;
  recipientName: string;
  institution: string;
  recipientAddress: string;
  subject: string;
  body: string;
}

export function createPrintableApplication(application: PrintableApplication): string {
  const isBangla = application.language === "bn";
  const labels = isBangla
    ? { to: "বরাবর", date: "তারিখ", subject: "বিষয়", greeting: "মহোদয়,", closing: "বিনীত নিবেদক," }
    : { to: "To", date: "Date", subject: "Subject", greeting: "Dear Sir/Madam,", closing: "Yours faithfully," };
  const lines = (value: string) => escapeHtml(value.trim()).replace(/\r?\n/g, "<br>");
  const recipient = [application.recipientName, application.institution, application.recipientAddress]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => `<div>${lines(value)}</div>`)
    .join("");
  const applicantContact = [application.applicantAddress, application.applicantPhone]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => `<div>${lines(value)}</div>`)
    .join("");

  return `<!doctype html>
<html lang="${isBangla ? "bn" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${lines(application.subject) || (isBangla ? "আবেদনপত্র" : "Application")}</title>
<style>
@page { size: A4; margin: 22mm 24mm; }
* { box-sizing: border-box; }
body {
  color: #172033;
  font-family: ${isBangla
    ? "'Noto Sans Bengali', 'Nirmala UI', 'Vrinda', sans-serif"
    : "Arial, 'Helvetica Neue', sans-serif"};
  font-size: 12pt;
  line-height: 1.75;
  margin: 0;
  direction: ltr;
}
.date { margin-bottom: 20px; text-align: right; }
.recipient { margin-bottom: 18px; }
.subject { margin: 18px 0; font-weight: 700; }
.body { margin: 12px 0; white-space: normal; }
.signature { margin-top: 32px; }
@media screen {
  body { margin: 22mm auto; max-width: 162mm; min-height: 253mm; }
}
</style>
</head>
<body>
<div class="date">${labels.date}: ${lines(application.date)}</div>
<div class="recipient"><strong>${labels.to}:</strong>${recipient}</div>
<div class="subject">${labels.subject}: ${lines(application.subject)}</div>
<div>${labels.greeting}</div>
<div class="body">${lines(application.body)}</div>
<div>${labels.closing}</div>
<div class="signature"><strong>${lines(application.applicantName)}</strong>${applicantContact}</div>
</body>
</html>`;
}

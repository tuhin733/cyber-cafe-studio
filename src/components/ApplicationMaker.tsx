import { useState } from "react";
import { ArrowLeft, Download, FileText, Printer, RefreshCw } from "lucide-react";
import {
  createApplicationDraft,
  createPrintableApplication,
  getApplicationPurposes,
  type ApplicationCategory,
  type ApplicationLanguage,
} from "../lib/applicationMaker";

interface Props {
  onClose: () => void;
}

const LABELS = {
  en: {
    title: "Application Maker",
    subtitle: "Prepare a formal application in Bangla or English.",
    language: "Language",
    category: "Institution type",
    purpose: "Application type",
    applicantName: "Your full name",
    applicantAddress: "Your address (optional)",
    phone: "Phone (optional)",
    recipient: "Recipient / designation",
    institution: "Bank, school, or office name",
    institutionAddress: "Institution address (optional)",
    date: "Date",
    details: "Request details",
    detailsHint: "Add dates, account / roll / reference numbers, reason, or other relevant information.",
    generate: "Generate draft",
    subject: "Subject",
    body: "Application text",
    preview: "Print preview",
    download: "Download .txt",
    print: "Print / Save PDF",
    printing: "Preparing…",
    successText: "Text file downloaded.",
    successPrint: "Print dialog opened. Choose “Save as PDF” to create a PDF.",
    back: "Back to document workspace",
    recipientPlaceholder: "e.g. The Branch Manager",
  },
  bn: {
    title: "দরখাস্ত তৈরি",
    subtitle: "বাংলা বা ইংরেজিতে একটি আনুষ্ঠানিক আবেদনপত্র তৈরি করুন।",
    language: "ভাষা",
    category: "প্রতিষ্ঠানের ধরন",
    purpose: "আবেদনের ধরন",
    applicantName: "আপনার পূর্ণ নাম",
    applicantAddress: "আপনার ঠিকানা (ঐচ্ছিক)",
    phone: "ফোন (ঐচ্ছিক)",
    recipient: "প্রাপক / পদবি",
    institution: "ব্যাংক, স্কুল বা দপ্তরের নাম",
    institutionAddress: "প্রতিষ্ঠানের ঠিকানা (ঐচ্ছিক)",
    date: "তারিখ",
    details: "আবেদনের বিস্তারিত",
    detailsHint: "তারিখ, হিসাব / শ্রেণি / রেফারেন্স নম্বর, কারণ বা প্রয়োজনীয় তথ্য লিখুন।",
    generate: "খসড়া তৈরি করুন",
    subject: "বিষয়",
    body: "আবেদনপত্রের লেখা",
    preview: "প্রিন্ট প্রিভিউ",
    download: ".txt ডাউনলোড",
    print: "প্রিন্ট / PDF হিসেবে সংরক্ষণ",
    printing: "প্রস্তুত হচ্ছে…",
    successText: "টেক্সট ফাইল ডাউনলোড হয়েছে।",
    successPrint: "প্রিন্ট ডায়ালগ খোলা হয়েছে। PDF তৈরি করতে “Save as PDF” নির্বাচন করুন।",
    back: "ডকুমেন্ট ওয়ার্কস্পেসে ফিরুন",
    recipientPlaceholder: "যেমন: শাখা ব্যবস্থাপক",
  },
} satisfies Record<ApplicationLanguage, Record<string, string>>;

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const labelClass = "block text-xs font-semibold text-slate-600";

function getToday(language: ApplicationLanguage) {
  return new Intl.DateTimeFormat(language === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function cleanFileName(value: string) {
  return value.trim().replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").slice(0, 60)
    || "Application";
}

export default function ApplicationMaker({ onClose }: Props) {
  const [language, setLanguage] = useState<ApplicationLanguage>("bn");
  const [category, setCategory] = useState<ApplicationCategory>("bank");
  const [purposeId, setPurposeId] = useState("statement");
  const [applicantName, setApplicantName] = useState("");
  const [applicantAddress, setApplicantAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [recipient, setRecipient] = useState("");
  const [institution, setInstitution] = useState("");
  const [institutionAddress, setInstitutionAddress] = useState("");
  const [date, setDate] = useState(() => getToday("bn"));
  const [details, setDetails] = useState("");
  const [subject, setSubject] = useState(() =>
    createApplicationDraft({
      language: "bn",
      category: "bank",
      purposeId: "statement",
      applicantName: "",
      details: "",
    }).subject,
  );
  const [body, setBody] = useState(() =>
    createApplicationDraft({
      language: "bn",
      category: "bank",
      purposeId: "statement",
      applicantName: "",
      details: "",
    }).body,
  );
  const [isPrinting, setIsPrinting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const labels = LABELS[language];
  const purposes = getApplicationPurposes(category);
  const selectedPurpose = purposes.find((item) => item.id === purposeId) ?? purposes[0];
  const recipientLabel = recipient.trim()
    || (language === "bn" ? "শাখা / প্রতিষ্ঠানের প্রধান" : "The Branch / Institution Head");

  const updateLanguage = (nextLanguage: ApplicationLanguage) => {
    setLanguage(nextLanguage);
    setDate(getToday(nextLanguage));
    setError("");
    setMessage("");
  };

  const composeDraft = (
    draftLanguage: ApplicationLanguage,
    draftCategory: ApplicationCategory,
    draftPurposeId: string,
    draftApplicantName: string,
    draftDetails: string,
  ) => {
    const draft = createApplicationDraft({
      language: draftLanguage,
      category: draftCategory,
      purposeId: draftPurposeId,
      applicantName: draftApplicantName,
      details: draftDetails,
    });
    setSubject(draft.subject);
    setBody(draft.body);
    setError("");
    setMessage("");
  };

  const generateDraft = () => {
    composeDraft(language, category, purposeId, applicantName, details);
  };

  const getPrintableHtml = () => createPrintableApplication({
    language,
    date,
    applicantName,
    applicantAddress,
    applicantPhone: phone,
    recipientName: recipientLabel,
    institution,
    recipientAddress: institutionAddress,
    subject,
    body,
  });

  const downloadText = () => {
    const isBangla = language === "bn";
    const text = [
      `${isBangla ? "তারিখ" : "Date"}: ${date}`,
      "",
      isBangla ? "বরাবর" : "To",
      recipientLabel,
      institution,
      institutionAddress,
      "",
      `${labels.subject}: ${subject}`,
      "",
      isBangla ? "মহোদয়," : "Dear Sir/Madam,",
      "",
      body,
      "",
      isBangla ? "বিনীত নিবেদক," : "Yours faithfully,",
      "",
      applicantName || (isBangla ? "[আপনার নাম]" : "[Your name]"),
      applicantAddress,
      phone ? `${isBangla ? "মোবাইল" : "Phone"}: ${phone}` : "",
    ].filter((line, index, list) => line || (index > 0 && list[index - 1] !== "")).join("\n");
    const blob = new Blob(["\uFEFF", text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cleanFileName(applicantName)}-Application.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError("");
    setMessage(labels.successText);
  };

  const printApplication = () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setError("");
    setMessage("");
    try {
      const frame = document.createElement("iframe");
      frame.title = labels.preview;
      frame.setAttribute("aria-hidden", "true");
      Object.assign(frame.style, {
        position: "fixed",
        width: "0",
        height: "0",
        border: "0",
        right: "0",
        bottom: "0",
      });
      frame.onload = () => {
        const printWindow = frame.contentWindow;
        if (!printWindow) {
          frame.remove();
          setIsPrinting(false);
          setError(language === "bn" ? "প্রিন্ট প্রিভিউ তৈরি করা যায়নি।" : "Couldn't prepare the print preview.");
          return;
        }
        const cleanup = () => frame.remove();
        printWindow.addEventListener("afterprint", cleanup, { once: true });
        window.setTimeout(cleanup, 60_000);
        try {
          printWindow.focus();
          printWindow.print();
          setMessage(labels.successPrint);
        } catch (printError) {
          console.error("Unable to print application", printError);
          cleanup();
          setError(language === "bn" ? "প্রিন্ট ডায়ালগ খোলা যায়নি। আবার চেষ্টা করুন।" : "Couldn't open the print dialog. Please try again.");
        } finally {
          setIsPrinting(false);
        }
      };
      frame.srcdoc = getPrintableHtml();
      document.body.appendChild(frame);
    } catch (printError) {
      console.error("Unable to prepare application print view", printError);
      setIsPrinting(false);
      setError(language === "bn" ? "প্রিন্ট প্রিভিউ তৈরি করা যায়নি।" : "Couldn't prepare the print preview.");
    }
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.back}
              title={labels.back}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{labels.title}</h2>
              <p className="text-xs text-slate-500">{labels.subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadText}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {labels.download}
            </button>
            <button
              type="button"
              onClick={printApplication}
              disabled={isPrinting}
              className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {isPrinting ? labels.printing : labels.print}
            </button>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {labels.language}
                  <select
                    className={inputClass}
                    value={language}
                    onChange={(event) => {
                      const nextLanguage = event.target.value;
                      if (nextLanguage !== "bn" && nextLanguage !== "en") return;
                      updateLanguage(nextLanguage);
                      composeDraft(nextLanguage, category, purposeId, applicantName, details);
                    }}
                  >
                    <option value="bn">বাংলা</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className={labelClass}>
                  {labels.category}
                  <select
                    className={inputClass}
                    value={category}
                    onChange={(event) => {
                      const nextCategory = event.target.value;
                      if (nextCategory !== "bank" && nextCategory !== "school" && nextCategory !== "government") return;
                      const nextPurposeId = getApplicationPurposes(nextCategory)[0].id;
                      setCategory(nextCategory);
                      setPurposeId(nextPurposeId);
                      setMessage("");
                      composeDraft(language, nextCategory, nextPurposeId, applicantName, details);
                    }}
                  >
                    <option value="bank">{language === "bn" ? "ব্যাংক" : "Bank"}</option>
                    <option value="school">{language === "bn" ? "স্কুল / শিক্ষাপ্রতিষ্ঠান" : "School / Institution"}</option>
                    <option value="government">{language === "bn" ? "সরকারি দপ্তর" : "Government office"}</option>
                  </select>
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  {labels.purpose}
                  <select
                    className={inputClass}
                    value={purposeId}
                    onChange={(event) => {
                      const nextPurposeId = event.target.value;
                      if (!purposes.some((purpose) => purpose.id === nextPurposeId)) return;
                      setPurposeId(nextPurposeId);
                      setMessage("");
                      composeDraft(language, category, nextPurposeId, applicantName, details);
                    }}
                  >
                    {purposes.map((purpose) => (
                      <option key={purpose.id} value={purpose.id}>{purpose.label[language]}</option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  {labels.applicantName}
                  <input className={inputClass} value={applicantName} onChange={(event) => setApplicantName(event.target.value)} autoComplete="name" />
                </label>
                <label className={labelClass}>
                  {labels.phone}
                  <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
                </label>
                <label className={labelClass}>
                  {labels.applicantAddress}
                  <input className={inputClass} value={applicantAddress} onChange={(event) => setApplicantAddress(event.target.value)} autoComplete="street-address" />
                </label>
                <label className={labelClass}>
                  {labels.date}
                  <input className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="mb-4 text-sm font-bold text-slate-800">
                {language === "bn" ? "প্রাপক ও প্রতিষ্ঠানের তথ্য" : "Recipient and institution"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {labels.recipient}
                  <input className={inputClass} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={labels.recipientPlaceholder} />
                </label>
                <label className={labelClass}>
                  {labels.institution}
                  <input className={inputClass} value={institution} onChange={(event) => setInstitution(event.target.value)} />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  {labels.institutionAddress}
                  <input className={inputClass} value={institutionAddress} onChange={(event) => setInstitutionAddress(event.target.value)} />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <label className={labelClass}>
                {labels.details}
                <span className="mt-1 block font-normal text-slate-500">{labels.detailsHint}</span>
                <textarea
                  className={`${inputClass} min-h-24 resize-y`}
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={generateDraft}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 transition-colors hover:bg-teal-100"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {labels.generate}
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                <FileText className="mr-1.5 inline h-4 w-4 text-teal-600" aria-hidden="true" />
                {language === "bn" ? "খসড়া সম্পাদনা করুন" : "Edit your application"}
              </h3>
              <label className={labelClass}>
                {labels.subject}
                <input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} />
              </label>
              <label className={`${labelClass} mt-3 block`}>
                {labels.body}
                <textarea className={`${inputClass} min-h-56 resize-y leading-relaxed`} value={body} onChange={(event) => setBody(event.target.value)} />
              </label>
            </section>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
            {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{message}</p>}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-4">
            <h3 className="mb-2 text-sm font-bold text-slate-700">{labels.preview}</h3>
            <article
              lang={language}
              className={`min-h-[520px] rounded-xl border border-slate-200 bg-white p-6 text-[12px] leading-7 text-slate-800 shadow-md sm:p-8 ${
                language === "bn" ? "font-sans" : "font-sans"
              }`}
            >
              <p className="mb-5 text-right">{language === "bn" ? "তারিখ" : "Date"}: {date}</p>
              <div className="mb-5">
                <p className="font-semibold">{language === "bn" ? "বরাবর" : "To"}</p>
                <p>{recipientLabel}</p>
                {institution && <p>{institution}</p>}
                {institutionAddress && <p className="whitespace-pre-wrap">{institutionAddress}</p>}
              </div>
              <p className="mb-5 font-bold">{labels.subject}: {subject}</p>
              <p className="mb-3">{language === "bn" ? "মহোদয়," : "Dear Sir/Madam,"}</p>
              <p className="whitespace-pre-wrap">{body}</p>
              <p className="mt-5">{language === "bn" ? "বিনীত নিবেদক," : "Yours faithfully,"}</p>
              <div className="mt-8">
                <p className="font-semibold">{applicantName || (language === "bn" ? "[আপনার নাম]" : "[Your name]")}</p>
                {applicantAddress && <p className="whitespace-pre-wrap">{applicantAddress}</p>}
                {phone && <p>{language === "bn" ? "মোবাইল" : "Phone"}: {phone}</p>}
              </div>
            </article>
            {selectedPurpose && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {language === "bn"
                  ? "খসড়াটি আপনার প্রয়োজন অনুযায়ী সম্পাদনা করে নিন।"
                  : "Review and personalize the draft before submitting it."}
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

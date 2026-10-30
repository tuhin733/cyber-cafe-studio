import { useState } from "react";
import { ArrowLeft, Download, Plus, Trash2 } from "lucide-react";

type Experience = {
  role: string;
  company: string;
  dates: string;
  details: string;
};

type Education = {
  qualification: string;
  institution: string;
  dates: string;
  details: string;
};

type ResumeData = {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
  skills: string;
  experience: Experience[];
  education: Education[];
};

type TemplateId = "modern" | "classic" | "minimal";

const TEMPLATES: Array<{
  id: TemplateId;
  name: string;
  description: string;
  accent: [number, number, number];
  accentClass: string;
  headingClass: string;
  nameClass: string;
  font: "helvetica" | "times";
  centered: boolean;
}> = [
  {
    id: "modern",
    name: "Modern",
    description: "Teal accents and a clean layout",
    accent: [13, 148, 136],
    accentClass: "text-teal-700",
    headingClass: "border-teal-600",
    nameClass: "text-slate-900",
    font: "helvetica",
    centered: false,
  },
  {
    id: "classic",
    name: "Classic",
    description: "Centered header with serif typography",
    accent: [30, 64, 100],
    accentClass: "text-blue-900",
    headingClass: "border-blue-900",
    nameClass: "font-serif text-slate-800",
    font: "times",
    centered: true,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Monochrome with subtle dividers",
    accent: [71, 85, 105],
    accentClass: "text-slate-600",
    headingClass: "border-slate-300",
    nameClass: "text-slate-950",
    font: "helvetica",
    centered: false,
  },
];

const EMPTY_EXPERIENCE: Experience = {
  role: "",
  company: "",
  dates: "",
  details: "",
};

const EMPTY_EDUCATION: Education = {
  qualification: "",
  institution: "",
  dates: "",
  details: "",
};

const INITIAL_RESUME: ResumeData = {
  name: "",
  title: "",
  email: "",
  phone: "",
  location: "",
  website: "",
  summary: "",
  skills: "",
  experience: [{ ...EMPTY_EXPERIENCE }],
  education: [{ ...EMPTY_EDUCATION }],
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const labelClass = "block text-xs font-semibold text-slate-600";

interface Props {
  onClose: () => void;
}

function cleanFileName(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "Resume";
}

export default function ResumeMaker({ onClose }: Props) {
  const [resume, setResume] = useState<ResumeData>(INITIAL_RESUME);
  const [templateId, setTemplateId] = useState<TemplateId>("modern");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];

  const updateField = <K extends keyof ResumeData>(field: K, value: ResumeData[K]) => {
    setResume((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  };

  const updateExperience = (index: number, field: keyof Experience, value: string) => {
    setResume((current) => ({
      ...current,
      experience: current.experience.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
    setError("");
    setSuccess("");
  };

  const updateEducation = (index: number, field: keyof Education, value: string) => {
    setResume((current) => ({
      ...current,
      education: current.education.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
    setError("");
    setSuccess("");
  };

  const exportPdf = async () => {
    if (!resume.name.trim()) {
      setError("Enter your name before exporting your resume.");
      return;
    }

    setIsExporting(true);
    setError("");
    setSuccess("");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = templateId === "minimal" ? 21 : 18;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      const ensureSpace = (height: number) => {
        if (y + height > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      const addText = (
        value: string,
        options: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {},
      ) => {
        const text = value.trim();
        if (!text) return;
        const size = options.size ?? 10;
        const lineHeight = size * 0.48;
        pdf.setFont(template.font, options.bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(...(options.color ?? [51, 65, 85]));
        const lines = pdf.splitTextToSize(text, contentWidth) as string[];
        for (const line of lines) {
          ensureSpace(lineHeight);
          pdf.text(line, margin, y);
          y += lineHeight;
        }
        y += options.gap ?? 2;
      };

      const addSection = (title: string) => {
        ensureSpace(12);
        y += 3;
        pdf.setFont(template.font, "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(...template.accent);
        pdf.text(title.toUpperCase(), margin, y);
        y += 2;
        const divider: [number, number, number] =
          templateId === "minimal" ? [226, 232, 240] : [203, 213, 225];
        pdf.setDrawColor(...divider);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 5;
      };

      pdf.setFont(template.font, "bold");
      pdf.setFontSize(22);
      if (templateId === "classic") pdf.setTextColor(30, 41, 59);
      else pdf.setTextColor(15, 23, 42);
      const nameLines = pdf.splitTextToSize(resume.name.trim(), contentWidth) as string[];
      ensureSpace(nameLines.length * 10 + 20);
      pdf.text(nameLines, template.centered ? pageWidth / 2 : margin, y, {
        align: template.centered ? "center" : "left",
      });
      y += nameLines.length * 10;

      if (resume.title.trim()) {
        const titleLines = pdf.splitTextToSize(resume.title.trim(), contentWidth) as string[];
        const lineHeight = 12 * 0.48;
        pdf.setFont(template.font, "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(...template.accent);
        for (const line of titleLines) {
          ensureSpace(lineHeight);
          pdf.text(line, template.centered ? pageWidth / 2 : margin, y, {
            align: template.centered ? "center" : "left",
          });
          y += lineHeight;
        }
        y += 3;
      }

      const contact = [
        resume.email.trim(),
        resume.phone.trim(),
        resume.location.trim(),
        resume.website.trim(),
      ].filter(Boolean);
      if (contact.length) {
        const contactLines = pdf.splitTextToSize(contact.join("  •  "), contentWidth) as string[];
        const lineHeight = 9 * 0.48;
        pdf.setFont(template.font, "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        for (const line of contactLines) {
          ensureSpace(lineHeight);
          pdf.text(line, template.centered ? pageWidth / 2 : margin, y, {
            align: template.centered ? "center" : "left",
          });
          y += lineHeight;
        }
        y += 2;
      }

      pdf.setDrawColor(...template.accent);
      pdf.setLineWidth(templateId === "minimal" ? 0.3 : 0.7);
      pdf.line(margin, y + 1, pageWidth - margin, y + 1);
      y += 6;

      if (resume.summary.trim()) {
        addSection("Profile");
        addText(resume.summary);
      }

      const experiences = resume.experience.filter((item) =>
        [item.role, item.company, item.dates, item.details].some((value) => value.trim()),
      );
      if (experiences.length) {
        addSection("Experience");
        experiences.forEach((item) => {
          addText([item.role, item.company].filter(Boolean).join(" — "), {
            size: 10,
            bold: true,
            gap: 1,
          });
          if (item.dates.trim()) {
            addText(item.dates, { size: 9, color: [100, 116, 139], gap: 1 });
          }
          addText(item.details);
          y += 2;
        });
      }

      const education = resume.education.filter((item) =>
        [item.qualification, item.institution, item.dates, item.details].some((value) => value.trim()),
      );
      if (education.length) {
        addSection("Education");
        education.forEach((item) => {
          addText([item.qualification, item.institution].filter(Boolean).join(" — "), {
            size: 10,
            bold: true,
            gap: 1,
          });
          if (item.dates.trim()) {
            addText(item.dates, { size: 9, color: [100, 116, 139], gap: 1 });
          }
          addText(item.details);
          y += 2;
        });
      }

      const skills = resume.skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      if (skills.length) {
        addSection("Skills");
        addText(skills.join("  •  "));
      }

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${cleanFileName(resume.name)}-Resume.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess("Resume PDF downloaded.");
    } catch (exportError) {
      console.error("Unable to export resume PDF", exportError);
      setError("Couldn't create the PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const skills = resume.skills.split(",").map((skill) => skill.trim()).filter(Boolean);
  const contact = [resume.email, resume.phone, resume.location, resume.website]
    .map((value) => value.trim())
    .filter(Boolean);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-5 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to document workspace"
              title="Back"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Resume Maker</h2>
              <p className="text-xs text-slate-500">Build and download a professional resume.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-wait disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExporting ? "Creating PDF…" : "Download PDF"}
          </button>
        </div>

        <section aria-label="Resume templates" className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-800">Choose a template</h3>
            <p className="mt-1 text-xs text-slate-500">The template is used in the preview and exported PDF.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={templateId === item.id}
                onClick={() => {
                  setTemplateId(item.id);
                  setError("");
                  setSuccess("");
                }}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  templateId === item.id
                    ? "border-teal-500 bg-teal-50 ring-2 ring-teal-100"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="mb-2 block rounded-lg border border-slate-200 bg-white p-2.5">
                  <span className={`mb-1.5 block h-1 w-1/2 rounded ${item.id === "modern" ? "bg-teal-600" : item.id === "classic" ? "mx-auto bg-blue-900" : "bg-slate-500"}`} />
                  <span className="mb-1 block h-0.5 w-full rounded bg-slate-200" />
                  <span className="mb-1 block h-0.5 w-4/5 rounded bg-slate-200" />
                  <span className="mt-2 block h-0.5 w-1/3 rounded bg-slate-300" />
                  <span className="mt-1 block h-0.5 w-full rounded bg-slate-100" />
                </span>
                <span className="block text-xs font-bold text-slate-800">{item.name}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{item.description}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="mb-4 text-sm font-bold text-slate-800">Personal details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`${labelClass} sm:col-span-2`}>
                  Full name *
                  <input className={inputClass} value={resume.name} onChange={(event) => updateField("name", event.target.value)} autoComplete="name" />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Professional title
                  <input className={inputClass} value={resume.title} onChange={(event) => updateField("title", event.target.value)} placeholder="e.g. Marketing Manager" />
                </label>
                <label className={labelClass}>
                  Email
                  <input className={inputClass} type="email" value={resume.email} onChange={(event) => updateField("email", event.target.value)} autoComplete="email" />
                </label>
                <label className={labelClass}>
                  Phone
                  <input className={inputClass} type="tel" value={resume.phone} onChange={(event) => updateField("phone", event.target.value)} autoComplete="tel" />
                </label>
                <label className={labelClass}>
                  Location
                  <input className={inputClass} value={resume.location} onChange={(event) => updateField("location", event.target.value)} autoComplete="address-level2" placeholder="City, Country" />
                </label>
                <label className={labelClass}>
                  Website or LinkedIn
                  <input className={inputClass} value={resume.website} onChange={(event) => updateField("website", event.target.value)} placeholder="linkedin.com/in/you" />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Professional summary
                  <textarea className={`${inputClass} min-h-24 resize-y`} value={resume.summary} onChange={(event) => updateField("summary", event.target.value)} placeholder="A short introduction highlighting your experience and strengths." />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-800">Work experience</h3>
                <button
                  type="button"
                  onClick={() => updateField("experience", [...resume.experience, { ...EMPTY_EXPERIENCE }])}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                </button>
              </div>
              <div className="space-y-4">
                {resume.experience.map((item, index) => (
                  <div key={index} className="relative rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    {resume.experience.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove experience ${index + 1}`}
                        onClick={() => updateField("experience", resume.experience.filter((_, itemIndex) => itemIndex !== index))}
                        className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelClass}>
                        Job title
                        <input className={inputClass} value={item.role} onChange={(event) => updateExperience(index, "role", event.target.value)} />
                      </label>
                      <label className={labelClass}>
                        Company
                        <input className={inputClass} value={item.company} onChange={(event) => updateExperience(index, "company", event.target.value)} />
                      </label>
                      <label className={`${labelClass} sm:col-span-2`}>
                        Dates
                        <input className={inputClass} value={item.dates} onChange={(event) => updateExperience(index, "dates", event.target.value)} placeholder="Jan 2022 – Present" />
                      </label>
                      <label className={`${labelClass} sm:col-span-2`}>
                        Responsibilities and achievements
                        <textarea className={`${inputClass} min-h-20 resize-y`} value={item.details} onChange={(event) => updateExperience(index, "details", event.target.value)} placeholder="Describe your work and accomplishments." />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-800">Education</h3>
                <button
                  type="button"
                  onClick={() => updateField("education", [...resume.education, { ...EMPTY_EDUCATION }])}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                </button>
              </div>
              <div className="space-y-4">
                {resume.education.map((item, index) => (
                  <div key={index} className="relative rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    {resume.education.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove education ${index + 1}`}
                        onClick={() => updateField("education", resume.education.filter((_, itemIndex) => itemIndex !== index))}
                        className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelClass}>
                        Degree or qualification
                        <input className={inputClass} value={item.qualification} onChange={(event) => updateEducation(index, "qualification", event.target.value)} />
                      </label>
                      <label className={labelClass}>
                        Institution
                        <input className={inputClass} value={item.institution} onChange={(event) => updateEducation(index, "institution", event.target.value)} />
                      </label>
                      <label className={`${labelClass} sm:col-span-2`}>
                        Dates
                        <input className={inputClass} value={item.dates} onChange={(event) => updateEducation(index, "dates", event.target.value)} placeholder="2018 – 2022" />
                      </label>
                      <label className={`${labelClass} sm:col-span-2`}>
                        Additional details
                        <textarea className={`${inputClass} min-h-16 resize-y`} value={item.details} onChange={(event) => updateEducation(index, "details", event.target.value)} placeholder="Optional details, honors, or coursework." />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-800">Skills</h3>
              <label className={labelClass}>
                Skills (separate with commas)
                <textarea className={`${inputClass} min-h-20 resize-y`} value={resume.skills} onChange={(event) => updateField("skills", event.target.value)} placeholder="Project management, Communication, Excel" />
              </label>
            </section>

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
            {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{success}</p>}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Live preview</h3>
              <span className="text-[11px] text-slate-400">A4 · {template.name}</span>
            </div>
            <article className={`min-h-[520px] rounded-xl border border-slate-200 bg-white p-6 shadow-md sm:p-8 ${templateId === "minimal" ? "sm:p-9" : ""} ${templateId === "classic" ? "font-serif" : ""}`}>
              <header className={`pb-4 ${templateId === "minimal" ? "border-b border-slate-300" : `border-b-2 ${template.headingClass}`} ${template.centered ? "text-center" : "text-left"}`}>
                <h1 className={`break-words text-2xl font-bold ${template.nameClass}`}>
                  {resume.name || "Your Name"}
                </h1>
                {resume.title && <p className={`mt-1 text-sm font-semibold ${template.accentClass}`}>{resume.title}</p>}
                {contact.length > 0 && (
                  <p className="mt-2 break-words text-[11px] leading-relaxed text-slate-500">
                    {contact.join("  •  ")}
                  </p>
                )}
              </header>

              {resume.summary && (
                <section className="mt-5">
                  <h2 className={`mb-2 text-[11px] font-bold uppercase tracking-wider ${template.accentClass}`}>Profile</h2>
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{resume.summary}</p>
                </section>
              )}

              {resume.experience.some((item) => item.role || item.company || item.dates || item.details) && (
                <section className="mt-5">
                  <h2 className={`mb-2 border-b pb-1 text-[11px] font-bold uppercase tracking-wider ${template.headingClass} ${template.accentClass}`}>Experience</h2>
                  <div className="space-y-3">
                    {resume.experience.filter((item) => item.role || item.company || item.dates || item.details).map((item, index) => (
                      <div key={index}>
                        <div className="flex flex-wrap justify-between gap-x-3">
                          {(item.role || item.company) && <p className="text-xs font-bold text-slate-800">{[item.role, item.company].filter(Boolean).join(" · ")}</p>}
                          {item.dates && <p className="text-[10px] text-slate-500">{item.dates}</p>}
                        </div>
                        {item.details && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-600">{item.details}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {resume.education.some((item) => item.qualification || item.institution || item.dates || item.details) && (
                <section className="mt-5">
                  <h2 className={`mb-2 border-b pb-1 text-[11px] font-bold uppercase tracking-wider ${template.headingClass} ${template.accentClass}`}>Education</h2>
                  <div className="space-y-3">
                    {resume.education.filter((item) => item.qualification || item.institution || item.dates || item.details).map((item, index) => (
                      <div key={index}>
                        <div className="flex flex-wrap justify-between gap-x-3">
                          {(item.qualification || item.institution) && <p className="text-xs font-bold text-slate-800">{[item.qualification, item.institution].filter(Boolean).join(" · ")}</p>}
                          {item.dates && <p className="text-[10px] text-slate-500">{item.dates}</p>}
                        </div>
                        {item.details && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-600">{item.details}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {skills.length > 0 && (
                <section className="mt-5">
                  <h2 className={`mb-2 border-b pb-1 text-[11px] font-bold uppercase tracking-wider ${template.headingClass} ${template.accentClass}`}>Skills</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((skill, index) => (
                      <span key={`${skill}-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-600">{skill}</span>
                    ))}
                  </div>
                </section>
              )}
            </article>
          </aside>
        </div>
      </div>
    </main>
  );
}

import { describe, expect, it } from "vitest";
import {
  createApplicationDraft,
  createPrintableApplication,
  getApplicationContent,
  getApplicationPurposes,
} from "./applicationMaker";

describe("application maker", () => {
  it("provides request types for each supported institution category", () => {
    expect(getApplicationPurposes("bank").map((purpose) => purpose.id)).toEqual([
      "statement",
      "account-update",
      "account-closure",
    ]);
    expect(getApplicationPurposes("school").map((purpose) => purpose.id)).toEqual([
      "leave",
      "certificate",
      "admission",
    ]);
    expect(getApplicationPurposes("government").map((purpose) => purpose.id)).toEqual([
      "certificate",
      "record-correction",
      "general-request",
    ]);
  });

  it("generates localized content for the selected request type", () => {
    const english = createApplicationDraft({
      language: "en",
      category: "school",
      purposeId: "leave",
      applicantName: "Ayesha Rahman",
      details: "Please grant leave from 10 to 12 November.",
    });
    expect(english.subject).toBe("Application for leave");
    expect(english.body).toContain("Ayesha Rahman");
    expect(english.body).toContain("10 to 12 November");

    const bangla = createApplicationDraft({
      language: "bn",
      category: "bank",
      purposeId: "statement",
      applicantName: "নাম",
      details: "হিসাব নম্বর ১২৩৪",
    });
    expect(bangla.subject).toContain("স্টেটমেন্ট");
    expect(bangla.body).toContain("নাম");
    expect(bangla.body).toContain("হিসাব নম্বর ১২৩৪");
  });

  it("falls back to the first purpose when the selected purpose is not valid", () => {
    expect(getApplicationContent("en", "bank", "unknown").subject).toBe(
      "Request for a bank account statement",
    );
  });

  it("escapes user-provided content in printable HTML", () => {
    const html = createPrintableApplication({
      language: "en",
      date: "30 October 2026",
      applicantName: "<script>alert(1)</script>",
      applicantAddress: "1 Main Street",
      applicantPhone: "",
      recipientName: "The Branch Manager",
      institution: "Bank & Co.",
      recipientAddress: "",
      subject: "Request <statement>",
      body: "Please review.\nThank you.",
    });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Bank &amp; Co.");
    expect(html).toContain("Request &lt;statement&gt;");
    expect(html).toContain("Please review.<br>Thank you.");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

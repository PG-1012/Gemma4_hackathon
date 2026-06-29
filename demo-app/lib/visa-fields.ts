/**
 * Visa application — canonical field model (the "hard mode" demo workflow).
 *
 * ~80 fields across a 6-page wizard. Same principles as lib/fields.ts: a field's
 * meaning (id, type, options, sample value, conditional rule) lives here once;
 * the two layouts (A and B) only differ in PAGE ORDER, FIELD ORDER, LABELS,
 * HELPER TEXT, and section names — never in the underlying data-field-id. That's
 * what proves the agent matches by meaning, not position, after the UI mutates.
 *
 * Conditional fields (showIf) genuinely show/hide based on a trigger field's
 * value — so the agent has to fill the trigger, watch a new field appear, then
 * fill it. The wizard renders all pages but reveals one at a time, so values
 * persist as you page back and forth.
 */

export type VisaFieldType =
  | "text"
  | "select"
  | "date"
  | "number"
  | "radio"
  | "checkbox"
  | "textarea";

/** Conditional visibility rule for a field. */
export interface ShowIf {
  field: string;
  equals?: string; // show when trigger === equals
  lessThan?: number; // show when Number(trigger value) < lessThan
}

export interface VisaFieldDef {
  id: string; // data-field-id (kebab-case, semantic)
  label: string;
  type: VisaFieldType;
  options?: string[];
  placeholder?: string;
  helper?: string;
  rows?: number;
  optional?: boolean;
  width?: "full" | "half" | "third"; // dense grid sizing
  showIf?: ShowIf;
  sampleValue: string; // what the AI enters during the simulated race
}

export const COUNTRIES = [
  "Afghanistan", "Argentina", "Australia", "Bangladesh", "Brazil", "Canada",
  "China", "Colombia", "Egypt", "France", "Germany", "Ghana", "India",
  "Indonesia", "Iran", "Italy", "Japan", "Kenya", "Mexico", "Nigeria",
  "Pakistan", "Philippines", "Poland", "Russia", "South Korea", "Spain",
  "Turkey", "Ukraine", "United Kingdom", "United States", "Vietnam",
];

export const LANGUAGES = [
  "Arabic", "Bengali", "English", "French", "German", "Hindi", "Italian",
  "Japanese", "Korean", "Mandarin", "Portuguese", "Russian", "Spanish",
  "Turkish", "Urdu", "Vietnamese", "Other",
];

const CODES = ["+1", "+33", "+39", "+44", "+49", "+81", "+86", "+91", "+92", "+234"];

// Every field, keyed by data-field-id. Default label = Layout A label.
export const VISA_FIELDS: Record<string, VisaFieldDef> = {
  // ---------- Page 1: Personal Information ----------
  "application-type": { id: "application-type", label: "Application type", type: "select", width: "full", options: ["Work Visa", "Student Visa", "Visitor Visa", "Permanent Residence", "Family Sponsorship"], helper: "Select the category under which you are applying.", sampleValue: "Work Visa" },
  "first-name": { id: "first-name", label: "First name (given name)", type: "text", width: "third", helper: "Exactly as it appears on your passport.", sampleValue: "Maria" },
  "middle-name": { id: "middle-name", label: "Middle name(s)", type: "text", width: "third", optional: true, helper: "Leave blank if not applicable.", sampleValue: "Elena" },
  "last-name": { id: "last-name", label: "Last name (surname)", type: "text", width: "third", sampleValue: "Rossi" },
  "other-names": { id: "other-names", label: "Other names used", type: "text", width: "full", optional: true, helper: "Include maiden names, aliases, or previous legal names.", sampleValue: "" },
  "date-of-birth": { id: "date-of-birth", label: "Date of birth", type: "date", width: "third", helper: "Use DD-MM-YYYY format.", sampleValue: "1990-04-12" },
  "place-of-birth-city": { id: "place-of-birth-city", label: "Place of birth — city", type: "text", width: "third", sampleValue: "Milan" },
  "place-of-birth-country": { id: "place-of-birth-country", label: "Place of birth — country", type: "select", width: "third", options: COUNTRIES, sampleValue: "Italy" },
  "country-of-citizenship": { id: "country-of-citizenship", label: "Country of citizenship", type: "select", width: "half", options: COUNTRIES, helper: "If you hold multiple citizenships, list the one on your travel document.", sampleValue: "Italy" },
  "country-of-residence": { id: "country-of-residence", label: "Country of current residence", type: "select", width: "half", options: COUNTRIES, sampleValue: "Italy" },
  sex: { id: "sex", label: "Sex", type: "radio", width: "half", options: ["Male", "Female", "Other"], sampleValue: "Female" },
  "marital-status": { id: "marital-status", label: "Marital status", type: "select", width: "half", options: ["Single", "Married", "Common-law", "Divorced", "Widowed", "Separated"], sampleValue: "Single" },
  "native-language": { id: "native-language", label: "Native language", type: "select", width: "half", options: LANGUAGES, sampleValue: "Italian" },
  email: { id: "email", label: "Email address", type: "text", width: "half", helper: "All correspondence regarding this application will be sent here.", sampleValue: "maria.rossi@example.com" },
  "phone-country-code": { id: "phone-country-code", label: "Country code", type: "select", width: "third", options: CODES, sampleValue: "+39" },
  "phone-number": { id: "phone-number", label: "Phone number", type: "text", width: "half", helper: "Include area code. No spaces or dashes.", sampleValue: "3331234567" },

  // ---------- Page 2: Travel & Identification Documents ----------
  "passport-number": { id: "passport-number", label: "Passport number", type: "text", width: "half", sampleValue: "YA1234567" },
  "passport-country": { id: "passport-country", label: "Passport country of issue", type: "select", width: "half", options: COUNTRIES, sampleValue: "Italy" },
  "passport-issue-date": { id: "passport-issue-date", label: "Passport issue date", type: "date", width: "half", helper: "Use DD-MM-YYYY format.", sampleValue: "2019-06-01" },
  "passport-expiry-date": { id: "passport-expiry-date", label: "Passport expiry date", type: "date", width: "half", helper: "Passport must be valid for at least 6 months beyond intended stay.", sampleValue: "2029-06-01" },
  "held-other-passports": { id: "held-other-passports", label: "Have you held other passports in the last 10 years?", type: "radio", width: "full", options: ["Yes", "No"], sampleValue: "No" },
  "national-id-number": { id: "national-id-number", label: "National identity number", type: "text", width: "half", optional: true, helper: "If issued by your country of citizenship.", sampleValue: "RSSMRA90D52F205X" },
  "held-previous-visa": { id: "held-previous-visa", label: "Have you been issued a visa to this country before?", type: "radio", width: "full", options: ["Yes", "No"], sampleValue: "Yes" },
  "previous-visa-number": { id: "previous-visa-number", label: "Previous visa number", type: "text", width: "half", showIf: { field: "held-previous-visa", equals: "Yes" }, sampleValue: "V-2021-88123" },
  "previous-visa-expiry": { id: "previous-visa-expiry", label: "Previous visa expiry date", type: "date", width: "half", showIf: { field: "held-previous-visa", equals: "Yes" }, sampleValue: "2023-08-15" },
  "intended-arrival-date": { id: "intended-arrival-date", label: "Date of intended arrival", type: "date", width: "half", sampleValue: "2026-09-01" },
  "intended-departure-date": { id: "intended-departure-date", label: "Date of intended departure", type: "date", width: "half", sampleValue: "2027-09-01" },
  "purpose-of-travel": { id: "purpose-of-travel", label: "Purpose of travel", type: "textarea", width: "full", rows: 3, helper: "Be specific. Failure to disclose the true purpose may result in application refusal.", sampleValue: "Employment as a software engineer under a sponsored work visa." },
  "funds-available": { id: "funds-available", label: "Funds available for trip (USD)", type: "number", width: "half", helper: "Approximate amount in US dollars.", sampleValue: "25000" },

  // ---------- Page 3: Address History ----------
  "current-street": { id: "current-street", label: "Current address — street", type: "text", width: "full", sampleValue: "Via Roma 42" },
  "current-city": { id: "current-city", label: "City", type: "text", width: "third", sampleValue: "Milan" },
  "current-state": { id: "current-state", label: "State / Province", type: "text", width: "third", sampleValue: "Lombardy" },
  "current-postal": { id: "current-postal", label: "Postal code", type: "text", width: "third", sampleValue: "20121" },
  "current-country": { id: "current-country", label: "Country", type: "select", width: "half", options: COUNTRIES, sampleValue: "Italy" },
  "time-current-years": { id: "time-current-years", label: "Time at current address — years", type: "number", width: "third", sampleValue: "3" },
  "time-current-months": { id: "time-current-months", label: "Months", type: "number", width: "third", sampleValue: "6" },
  "previous-street": { id: "previous-street", label: "Previous address — street", type: "text", width: "full", showIf: { field: "time-current-years", lessThan: 5 }, helper: "Required if less than 5 years at current address.", sampleValue: "Via Verdi 10" },
  "previous-city": { id: "previous-city", label: "City", type: "text", width: "third", showIf: { field: "time-current-years", lessThan: 5 }, sampleValue: "Turin" },
  "previous-state": { id: "previous-state", label: "State / Province", type: "text", width: "third", showIf: { field: "time-current-years", lessThan: 5 }, sampleValue: "Piedmont" },
  "previous-country": { id: "previous-country", label: "Country", type: "select", width: "third", options: COUNTRIES, showIf: { field: "time-current-years", lessThan: 5 }, sampleValue: "Italy" },
  "lived-other-countries": { id: "lived-other-countries", label: "Have you lived in any other countries in the past 10 years?", type: "radio", width: "full", options: ["Yes", "No"], sampleValue: "No" },
  "other-country-name": { id: "other-country-name", label: "Country", type: "select", width: "third", options: COUNTRIES, showIf: { field: "lived-other-countries", equals: "Yes" }, sampleValue: "France" },
  "other-country-from": { id: "other-country-from", label: "From date", type: "date", width: "third", showIf: { field: "lived-other-countries", equals: "Yes" }, sampleValue: "2014-01-01" },
  "other-country-to": { id: "other-country-to", label: "To date", type: "date", width: "third", showIf: { field: "lived-other-countries", equals: "Yes" }, sampleValue: "2016-12-31" },

  // ---------- Page 4: Employment & Education ----------
  occupation: { id: "occupation", label: "Current occupation", type: "text", width: "half", sampleValue: "Software Engineer" },
  "employer-name": { id: "employer-name", label: "Current employer name", type: "text", width: "half", sampleValue: "Tech Solutions SRL" },
  "employer-address": { id: "employer-address", label: "Employer address", type: "text", width: "full", sampleValue: "Corso Buenos Aires 1, Milan" },
  "employer-phone": { id: "employer-phone", label: "Employer phone", type: "text", width: "half", sampleValue: "+39 02 1234567" },
  "position-title": { id: "position-title", label: "Position title", type: "text", width: "half", sampleValue: "Senior Software Engineer" },
  "employment-start-date": { id: "employment-start-date", label: "Employment start date", type: "date", width: "half", sampleValue: "2021-03-01" },
  "annual-income": { id: "annual-income", label: "Annual income (USD)", type: "number", width: "half", sampleValue: "85000" },
  "employed-past-10-years": { id: "employed-past-10-years", label: "Have you been employed in the past 10 years?", type: "radio", width: "full", options: ["Yes", "No"], sampleValue: "Yes" },
  "highest-education": { id: "highest-education", label: "Highest level of education", type: "select", width: "half", options: ["High School", "Associate", "Bachelor", "Master", "PhD", "Other"], sampleValue: "Master" },
  "field-of-study": { id: "field-of-study", label: "Field of study", type: "text", width: "half", sampleValue: "Computer Science" },
  "institution-name": { id: "institution-name", label: "Institution name", type: "text", width: "half", sampleValue: "Politecnico di Milano" },
  "country-of-education": { id: "country-of-education", label: "Country of education", type: "select", width: "half", options: COUNTRIES, sampleValue: "Italy" },
  "year-of-graduation": { id: "year-of-graduation", label: "Year of graduation", type: "number", width: "third", sampleValue: "2014" },

  // ---------- Page 5: Background Questions ----------
  "background-refused-visa": { id: "background-refused-visa", label: "Have you ever been refused a visa or entry to any country?", type: "radio", width: "full", options: ["Yes", "No"], helper: "This includes but is not limited to refusal at a port of entry or withdrawal of an application at a border.", sampleValue: "No" },
  "background-refused-visa-detail": { id: "background-refused-visa-detail", label: "Provide details", type: "textarea", width: "full", rows: 2, showIf: { field: "background-refused-visa", equals: "Yes" }, sampleValue: "" },
  "background-deported": { id: "background-deported", label: "Have you ever been deported or removed from any country?", type: "radio", width: "full", options: ["Yes", "No"], helper: "Including voluntary departure under order of removal.", sampleValue: "No" },
  "background-deported-detail": { id: "background-deported-detail", label: "Provide details", type: "textarea", width: "full", rows: 2, showIf: { field: "background-deported", equals: "Yes" }, sampleValue: "" },
  "background-criminal": { id: "background-criminal", label: "Have you ever been convicted of a crime?", type: "radio", width: "full", options: ["Yes", "No"], helper: "Including offenses for which a pardon or expungement has been granted. Failure to disclose may result in refusal.", sampleValue: "No" },
  "background-criminal-detail": { id: "background-criminal-detail", label: "Provide details", type: "textarea", width: "full", rows: 2, showIf: { field: "background-criminal", equals: "Yes" }, sampleValue: "" },
  "background-terrorism": { id: "background-terrorism", label: "Have you ever been involved in any act of terrorism, espionage, sabotage, or genocide?", type: "radio", width: "full", options: ["Yes", "No"], helper: "As defined under the Immigration and National Security Act.", sampleValue: "No" },
  "background-military": { id: "background-military", label: "Have you served in any military, paramilitary, or police force?", type: "radio", width: "full", options: ["Yes", "No"], sampleValue: "No" },
  "background-military-detail": { id: "background-military-detail", label: "Provide unit, rank, and dates of service", type: "textarea", width: "full", rows: 2, showIf: { field: "background-military", equals: "Yes" }, sampleValue: "" },
  "background-disease": { id: "background-disease", label: "Do you have any communicable diseases of public health significance?", type: "radio", width: "full", options: ["Yes", "No"], helper: "As listed in Schedule 1 of the Public Health regulations.", sampleValue: "No" },
  "background-political-party": { id: "background-political-party", label: "Have you been a member of any political party in the past 10 years?", type: "radio", width: "full", options: ["Yes", "No"], sampleValue: "No" },
  "background-political-party-detail": { id: "background-political-party-detail", label: "Provide party name and dates of membership", type: "textarea", width: "full", rows: 2, showIf: { field: "background-political-party", equals: "Yes" }, sampleValue: "" },
  "background-investigation": { id: "background-investigation", label: "Are you currently being investigated for any offense?", type: "radio", width: "full", options: ["Yes", "No"], sampleValue: "No" },

  // ---------- Page 6: Declaration & Submit ----------
  "sponsor-name": { id: "sponsor-name", label: "Sponsor / reference — name", type: "text", width: "half", helper: "A contact in the destination country.", sampleValue: "Giovanni Bianchi" },
  "sponsor-address": { id: "sponsor-address", label: "Sponsor / reference — address", type: "text", width: "half", sampleValue: "Piazza Duomo 5, Milan" },
  "sponsor-phone": { id: "sponsor-phone", label: "Sponsor / reference — phone", type: "text", width: "half", sampleValue: "+39 02 7654321" },
  "sponsor-relationship": { id: "sponsor-relationship", label: "Relationship to applicant", type: "text", width: "half", sampleValue: "Employer" },
  "emergency-name": { id: "emergency-name", label: "Emergency contact — name", type: "text", width: "third", sampleValue: "Luca Rossi" },
  "emergency-phone": { id: "emergency-phone", label: "Emergency contact — phone", type: "text", width: "third", sampleValue: "+39 333 9876543" },
  "emergency-relationship": { id: "emergency-relationship", label: "Relationship", type: "text", width: "third", sampleValue: "Brother" },
  "declaration-checkbox": { id: "declaration-checkbox", label: "I declare that all information provided is true and accurate to the best of my knowledge. I understand that providing false information may result in refusal of this application and potential criminal prosecution under Section 127 of the Immigration Act.", type: "checkbox", width: "full", sampleValue: "true" },
  signature: { id: "signature", label: "Signature (type your full legal name)", type: "text", width: "half", sampleValue: "Maria Elena Rossi" },
  "declaration-date": { id: "declaration-date", label: "Date", type: "date", width: "third", helper: "Use DD-MM-YYYY format.", sampleValue: "2026-06-29" },
};

export interface VisaPage {
  title: string;
  intro?: string;
  fields: string[];
}

export interface VisaLayout {
  variant: "A" | "B";
  pages: VisaPage[];
  labelOverrides?: Record<string, string>;
  helperOverrides?: Record<string, string>;
}

export const VISA_LAYOUT_A: VisaLayout = {
  variant: "A",
  pages: [
    { title: "Personal Information", intro: "Provide your personal details exactly as they appear on your travel document.", fields: ["application-type", "first-name", "middle-name", "last-name", "other-names", "date-of-birth", "place-of-birth-city", "place-of-birth-country", "country-of-citizenship", "country-of-residence", "sex", "marital-status", "native-language", "email", "phone-country-code", "phone-number"] },
    { title: "Travel & Identification Documents", fields: ["passport-number", "passport-country", "passport-issue-date", "passport-expiry-date", "held-other-passports", "national-id-number", "held-previous-visa", "previous-visa-number", "previous-visa-expiry", "intended-arrival-date", "intended-departure-date", "purpose-of-travel", "funds-available"] },
    { title: "Address History", fields: ["current-street", "current-city", "current-state", "current-postal", "current-country", "time-current-years", "time-current-months", "previous-street", "previous-city", "previous-state", "previous-country", "lived-other-countries", "other-country-name", "other-country-from", "other-country-to"] },
    { title: "Employment & Education", fields: ["occupation", "employer-name", "employer-address", "employer-phone", "position-title", "employment-start-date", "annual-income", "employed-past-10-years", "highest-education", "field-of-study", "institution-name", "country-of-education", "year-of-graduation"] },
    { title: "Background Questions", intro: "All applicants must answer the following. Failure to disclose may result in refusal and a finding of misrepresentation.", fields: ["background-refused-visa", "background-refused-visa-detail", "background-deported", "background-deported-detail", "background-criminal", "background-criminal-detail", "background-terrorism", "background-military", "background-military-detail", "background-disease", "background-political-party", "background-political-party-detail", "background-investigation"] },
    { title: "Declaration & Submit", fields: ["sponsor-name", "sponsor-address", "sponsor-phone", "sponsor-relationship", "emergency-name", "emergency-phone", "emergency-relationship", "declaration-checkbox", "signature", "declaration-date"] },
  ],
};

/**
 * Layout B — the mutated portal: pages 3 and 4 swapped, fields reordered within
 * pages, labels and helper text reworded, section headers renamed. SAME ids.
 */
export const VISA_LAYOUT_B: VisaLayout = {
  variant: "B",
  labelOverrides: {
    "first-name": "Given name (as on passport)",
    "last-name": "Family name (as on passport)",
    "date-of-birth": "Birth date",
    "country-of-citizenship": "Nationality",
    "purpose-of-travel": "Reason for your visit",
    occupation: "Job title / occupation",
    "highest-education": "Education level completed",
    "background-criminal": "Have you ever been charged with or convicted of any criminal offense?",
    signature: "Applicant signature (full legal name)",
  },
  helperOverrides: {
    "first-name": "Must match your passport exactly. Discrepancies will delay processing.",
    "date-of-birth": "Format: DD-MM-YYYY.",
    "purpose-of-travel": "Describe in your own words. Inconsistencies with supporting documents may result in refusal.",
  },
  pages: [
    { title: "Applicant Details", intro: "Enter your information as it appears on your passport. Fields marked with an asterisk are mandatory.", fields: ["application-type", "last-name", "first-name", "middle-name", "date-of-birth", "sex", "other-names", "place-of-birth-country", "place-of-birth-city", "country-of-citizenship", "country-of-residence", "marital-status", "native-language", "phone-country-code", "phone-number", "email"] },
    { title: "Passport & Travel", fields: ["passport-number", "passport-country", "passport-expiry-date", "passport-issue-date", "held-previous-visa", "previous-visa-number", "previous-visa-expiry", "held-other-passports", "national-id-number", "purpose-of-travel", "intended-arrival-date", "intended-departure-date", "funds-available"] },
    // pages 3 and 4 swapped vs Layout A
    { title: "Work & Schooling History", fields: ["position-title", "occupation", "employer-name", "employer-address", "employer-phone", "annual-income", "employment-start-date", "employed-past-10-years", "highest-education", "field-of-study", "institution-name", "country-of-education", "year-of-graduation"] },
    { title: "Places You Have Lived", fields: ["current-country", "current-street", "current-city", "current-state", "current-postal", "time-current-years", "time-current-months", "previous-street", "previous-city", "previous-state", "previous-country", "lived-other-countries", "other-country-name", "other-country-from", "other-country-to"] },
    { title: "Security & Admissibility", intro: "You are required by law to answer each question truthfully.", fields: ["background-criminal", "background-criminal-detail", "background-refused-visa", "background-refused-visa-detail", "background-deported", "background-deported-detail", "background-terrorism", "background-disease", "background-military", "background-military-detail", "background-political-party", "background-political-party-detail", "background-investigation"] },
    { title: "Declaration", fields: ["emergency-name", "emergency-phone", "emergency-relationship", "sponsor-name", "sponsor-relationship", "sponsor-address", "sponsor-phone", "declaration-checkbox", "signature", "declaration-date"] },
  ],
};

export function visaLabel(layout: VisaLayout, id: string): string {
  return layout.labelOverrides?.[id] ?? VISA_FIELDS[id].label;
}

export function visaHelper(layout: VisaLayout, id: string): string | undefined {
  return layout.helperOverrides?.[id] ?? VISA_FIELDS[id].helper;
}

/** Flat ordered field-id list across all pages (used by the simulator). */
export function visaOrderedFieldIds(layout: VisaLayout): string[] {
  return layout.pages.flatMap((p) => p.fields);
}

/** Page index each field lives on (so the simulator knows when to click Next). */
export function visaPageOf(layout: VisaLayout, id: string): number {
  return layout.pages.findIndex((p) => p.fields.includes(id));
}

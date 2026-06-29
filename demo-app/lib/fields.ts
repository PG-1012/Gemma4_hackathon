/**
 * Canonical field model shared by Form A and Form B.
 *
 * A field's *meaning* (id, type, options, sample value) lives here once. The two
 * layouts differ only in ORDER, LABELS, GROUPING, and dropdown option order —
 * never in the underlying `data-field-id`. That's what proves the agent matches
 * fields by meaning, not position.
 */

export type FieldType =
  | "text"
  | "select"
  | "date"
  | "number"
  | "radio"
  | "checkbox"
  | "textarea";

export interface FieldDef {
  id: string; // becomes data-field-id
  label: string; // default (Layout A) label
  type: FieldType;
  options?: string[];
  placeholder?: string;
  helper?: string;
  prefix?: string; // e.g. "$"
  rows?: number;
  fullWidth?: boolean; // span both columns in a 2-col section
  dependsOn?: { field: string }; // enabled only when that checkbox is checked
  sampleValue: string; // what the AI fills during the simulated race
}

export const FIELDS: Record<string, FieldDef> = {
  "employee-name": { id: "employee-name", label: "Employee name", type: "text", placeholder: "Jordan Avery", sampleValue: "Jordan Avery" },
  "employee-id": { id: "employee-id", label: "Employee ID", type: "text", placeholder: "AC-00000", sampleValue: "AC-48217" },
  department: { id: "department", label: "Department", type: "select", options: ["Engineering", "Sales", "Marketing", "Finance", "Operations", "HR"], sampleValue: "Engineering" },
  "manager-name": { id: "manager-name", label: "Manager name", type: "text", placeholder: "Approving manager", sampleValue: "Sarah Chen" },
  "report-title": { id: "report-title", label: "Report title", type: "text", placeholder: "Short description of this report", sampleValue: "Q3 Architecture Summit — Austin" },
  "expense-date": { id: "expense-date", label: "Date of expense", type: "date", sampleValue: "2026-06-15" },
  "expense-category": { id: "expense-category", label: "Expense category", type: "select", options: ["Travel", "Meals", "Software", "Office Supplies", "Client Entertainment", "Training"], sampleValue: "Travel" },
  "vendor-name": { id: "vendor-name", label: "Vendor name", type: "text", placeholder: "Merchant or supplier", sampleValue: "United Airlines" },
  amount: { id: "amount", label: "Amount", type: "number", prefix: "$", placeholder: "0.00", helper: "Enter the pre-tax amount.", sampleValue: "1284.50" },
  currency: { id: "currency", label: "Currency", type: "select", options: ["USD", "CAD", "EUR", "GBP"], helper: "Required for international expenses.", sampleValue: "USD" },
  "payment-method": { id: "payment-method", label: "Payment method", type: "radio", options: ["Personal Card", "Corporate Card", "Cash"], fullWidth: true, sampleValue: "Corporate Card" },
  "project-code": { id: "project-code", label: "Project code", type: "text", placeholder: "PRJ-0000-000", sampleValue: "PRJ-2026-Q3-114" },
  "cost-center": { id: "cost-center", label: "Cost center", type: "text", placeholder: "CC-000-00", sampleValue: "CC-ENG-07" },
  "business-justification": { id: "business-justification", label: "Business justification", type: "textarea", rows: 3, fullWidth: true, placeholder: "Explain the business purpose of this expense…", helper: "Be specific — Finance reviews this field.", sampleValue: "Round-trip airfare to attend the Q3 platform architecture summit in Austin." },
  "receipt-attached": { id: "receipt-attached", label: "Receipt attached", type: "checkbox", fullWidth: true, sampleValue: "true" },
  billable: { id: "billable", label: "Billable to client", type: "checkbox", fullWidth: true, sampleValue: "true" },
  "client-name": { id: "client-name", label: "Client name", type: "text", placeholder: "Client to bill", helper: "Enabled only when the expense is billable.", dependsOn: { field: "billable" }, sampleValue: "Initech Global" },
  "approval-routing": { id: "approval-routing", label: "Approval routing", type: "select", options: ["Direct Manager", "Skip Level", "Finance Director"], sampleValue: "Direct Manager" },
  terms: { id: "terms", label: "I certify these expenses comply with company policy", type: "checkbox", fullWidth: true, sampleValue: "true" },
};

export interface FormSection {
  title: string;
  columns: 1 | 2;
  fields: string[];
}

export interface FormLayout {
  variant: "A" | "B";
  sections: FormSection[];
  labelOverrides?: Record<string, string>;
  optionOverrides?: Record<string, string[]>;
}

/** Layout A — clean single-column, the "original" the workflow is recorded on. */
export const LAYOUT_A: FormLayout = {
  variant: "A",
  sections: [
    { title: "Employee", columns: 1, fields: ["employee-name", "employee-id", "department", "manager-name"] },
    { title: "Report", columns: 1, fields: ["report-title", "expense-date", "expense-category", "vendor-name"] },
    { title: "Amount", columns: 1, fields: ["amount", "currency", "payment-method"] },
    { title: "Accounting", columns: 1, fields: ["project-code", "cost-center", "business-justification"] },
    { title: "Approval", columns: 1, fields: ["receipt-attached", "billable", "client-name", "approval-routing", "terms"] },
  ],
};

/**
 * Layout B — the "mutated" UI: two-column, reordered, regrouped, relabeled, with
 * reordered dropdown options. SAME data-field-ids. This is the slide that proves
 * adaptation: the agent still completes it because it reads meaning, not position.
 */
export const LAYOUT_B: FormLayout = {
  variant: "B",
  labelOverrides: {
    "employee-name": "Submitter name",
    "report-title": "Expense report name",
    "vendor-name": "Merchant / Vendor",
    "business-justification": "Purpose of expense",
    "expense-date": "Transaction date",
  },
  optionOverrides: {
    department: ["Finance", "Engineering", "HR", "Sales", "Operations", "Marketing"],
    currency: ["EUR", "GBP", "USD", "CAD"],
  },
  sections: [
    { title: "Submission details", columns: 2, fields: ["employee-name", "report-title", "employee-id", "department", "manager-name", "expense-category"] },
    { title: "Charges", columns: 2, fields: ["vendor-name", "payment-method", "amount", "currency", "project-code", "cost-center"] },
    { title: "Justification & approval", columns: 2, fields: ["business-justification", "approval-routing", "receipt-attached", "billable", "client-name", "expense-date", "terms"] },
  ],
};

/** Flat ordered field-id list for a layout (used by the simulator). */
export function orderedFieldIds(layout: FormLayout): string[] {
  return layout.sections.flatMap((s) => s.fields);
}

export function labelFor(layout: FormLayout, id: string): string {
  return layout.labelOverrides?.[id] ?? FIELDS[id].label;
}

export function optionsFor(layout: FormLayout, id: string): string[] | undefined {
  return layout.optionOverrides?.[id] ?? FIELDS[id].options;
}

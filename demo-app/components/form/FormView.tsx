"use client";

import { useEffect, useRef, useState } from "react";
import {
  FIELDS,
  FormLayout,
  labelFor,
  optionsFor,
} from "@/lib/fields";

/**
 * Renders an enterprise expense form from a layout descriptor.
 *
 * Inputs are intentionally UNCONTROLLED (defaultValue) so the Race UI can fill
 * them from the parent window by setting `el.value` + dispatching events — that
 * is how the simulated "AI" visibly types into this form inside an iframe.
 * Light React state only drives the billable→client-name dependency and the
 * submit confirmation.
 */
export function FormView({ layout }: { layout: FormLayout }) {
  const [billable, setBillable] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Re-sync the dependency if the AI sets the checkbox programmatically.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t?.dataset?.fieldId === "billable") setBillable(!!t.checked);
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="ent-form min-h-screen px-5 py-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-[#d7dde3] bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-[#eef1f4] px-7 py-5">
          <div>
            <h1 className="m-0 text-[19px] font-semibold text-[#111827]">
              Expense Report
            </h1>
            <p className="m-0 mt-0.5 text-[12px] text-[#6b7280]">
              Submit a new expense for approval · Layout {layout.variant}
            </p>
          </div>
          <span className="text-[16px] font-bold tracking-tight text-[#2563eb]">
            ACME&nbsp;CORP
          </span>
        </header>

        <form
          ref={formRef}
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            (e.currentTarget.querySelector("#submit-success") as HTMLElement)?.scrollIntoView({
              behavior: "smooth",
            });
          }}
          className="px-7 py-6"
        >
          {layout.sections.map((section) => (
            <section key={section.title} className="mb-7">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#9ca3af]">
                {section.title}
              </h2>
              <div
                className={
                  section.columns === 2
                    ? "grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2"
                    : "flex flex-col gap-4"
                }
              >
                {section.fields.map((id) => (
                  <Field
                    key={id}
                    id={id}
                    label={labelFor(layout, id)}
                    options={optionsFor(layout, id)}
                    billable={billable}
                  />
                ))}
              </div>
            </section>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              data-field-id="submit"
              className="rounded-lg bg-[#2563eb] px-6 py-3 text-[15px] font-semibold text-white hover:bg-[#1d4ed8]"
            >
              Submit Expense Report
            </button>
            <button
              type="reset"
              onClick={() => {
                setSubmitted(false);
                setBillable(false);
              }}
              className="rounded-lg border border-[#d7dde3] bg-white px-5 py-3 text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb]"
            >
              Clear
            </button>
          </div>

          <div
            id="submit-success"
            className={`mt-5 rounded-lg border px-4 py-3 text-[14px] font-semibold transition-all ${
              submitted
                ? "border-[#bbf7d0] bg-[#ecfdf5] text-[#16a34a] opacity-100"
                : "h-0 overflow-hidden border-transparent p-0 opacity-0"
            }`}
          >
            ✓ Expense report submitted successfully.
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  options,
  billable,
}: {
  id: string;
  label: string;
  options?: string[];
  billable: boolean;
}) {
  const def = FIELDS[id];
  const disabled = def.dependsOn?.field === "billable" && !billable;
  const wrapClass = def.fullWidth ? "sm:col-span-2" : "";

  if (def.type === "checkbox") {
    return (
      <label
        data-field-container={id}
        className={`flex items-center gap-2.5 text-[14px] text-[#374151] ${wrapClass}`}
      >
        <input
          type="checkbox"
          data-field-id={id}
          className="h-4 w-4 accent-[#2563eb]"
        />
        {label}
      </label>
    );
  }

  if (def.type === "radio") {
    return (
      <div data-field-container={id} className={wrapClass}>
        <span className="ent-label">{label}</span>
        <div className="flex flex-wrap gap-4">
          {options?.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-[14px] text-[#374151]">
              <input
                type="radio"
                name={id}
                value={opt}
                data-field-id={id}
                data-field-option={opt}
                className="h-4 w-4 accent-[#2563eb]"
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-field-container={id} className={wrapClass}>
      <label className="ent-label" htmlFor={id}>
        {label}
      </label>
      {def.type === "select" ? (
        <select id={id} data-field-id={id} className="ent-control" defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : def.type === "textarea" ? (
        <textarea
          id={id}
          data-field-id={id}
          rows={def.rows ?? 3}
          placeholder={def.placeholder}
          className="ent-control resize-y"
        />
      ) : (
        <div className="relative">
          {def.prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">
              {def.prefix}
            </span>
          )}
          <input
            id={id}
            data-field-id={id}
            type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
            placeholder={def.placeholder}
            disabled={disabled}
            className={`ent-control ${def.prefix ? "pl-7" : ""}`}
          />
        </div>
      )}
      {def.helper && <p className="ent-helper">{def.helper}</p>}
    </div>
  );
}

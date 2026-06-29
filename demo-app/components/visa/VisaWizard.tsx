"use client";

import { useEffect, useRef, useState } from "react";
import {
  VISA_FIELDS,
  VisaFieldDef,
  VisaLayout,
  visaHelper,
  visaLabel,
} from "@/lib/visa-fields";

const WIDTH_CLASS: Record<string, string> = {
  full: "gov-col-full",
  half: "gov-col-half",
  third: "gov-col-third",
};

function makeAppId(): string {
  const n = Math.floor(10000 + Math.random() * 89999);
  const L = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const a = L[(Math.random() * L.length) | 0] + L[(Math.random() * L.length) | 0];
  return `IMM-${n}-${a}`;
}

/**
 * 6-page visa wizard. Native HTML controls with data-field-id (so the agent /
 * simulator can drive it and the highlight overlay can find fields). All pages
 * render at once but only the active one is shown — so values persist as you
 * page back and forth without controlling the inputs.
 */
export function VisaWizard({ layout }: { layout: VisaLayout }) {
  const [page, setPage] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  // Generated client-side only (Math.random would mismatch SSR vs client).
  const [appId, setAppId] = useState("IMM-—————");
  useEffect(() => setAppId(makeAppId()), []);
  const formRef = useRef<HTMLFormElement>(null);
  const last = layout.pages.length - 1;

  // Observe (don't control) inputs so we can drive conditional visibility.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      const id = t?.dataset?.fieldId;
      if (!id) return;
      const v =
        t.type === "checkbox" ? String(t.checked) : t.value;
      setValues((prev) => ({ ...prev, [id]: v }));
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onChange);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onChange);
    };
  }, []);

  const visible = (def: VisaFieldDef): boolean => {
    const rule = def.showIf;
    if (!rule) return true;
    const v = values[rule.field];
    if (rule.equals !== undefined) return v === rule.equals;
    if (rule.lessThan !== undefined) return Number(v || 0) < rule.lessThan;
    return true;
  };

  const goNext = () => {
    setPage((p) => Math.min(p + 1, last));
    formRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goPrev = () => {
    setPage((p) => Math.max(p - 1, 0));
    formRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submitted) {
    return <Confirmation appId={appId} />;
  }

  return (
    <div className="gov flex min-h-screen flex-col">
      <Header appId={appId} />
      <StepBar pages={layout.pages.map((p) => p.title)} page={page} />

      <form
        ref={formRef}
        autoComplete="off"
        onSubmit={(e) => e.preventDefault()}
        className="flex-1 overflow-auto"
      >
        {layout.pages.map((pg, i) => (
          <section
            key={pg.title}
            style={{ display: i === page ? "block" : "none" }}
            className="gov-panel"
          >
            <h2 className="gov-page-title gov-serif">
              Section {i + 1} of {layout.pages.length}: {pg.title}
            </h2>
            {pg.intro && <p className="gov-intro">{pg.intro}</p>}
            <div className="gov-grid">
              {pg.fields.map((id) => {
                const def = VISA_FIELDS[id];
                if (!def) return null;
                return (
                  <Field
                    key={id}
                    def={def}
                    label={visaLabel(layout, id)}
                    helper={visaHelper(layout, id)}
                    show={visible(def)}
                  />
                );
              })}
            </div>
          </section>
        ))}

        <div className="gov-nav">
          <button
            type="button"
            data-field-id="wizard-prev"
            data-field-container="wizard-prev"
            className="gov-btn secondary"
            disabled={page === 0}
            onClick={goPrev}
          >
            ‹ Previous
          </button>
          {page < last ? (
            <button
              type="button"
              data-field-id="wizard-next"
              data-field-container="wizard-next"
              className="gov-btn"
              onClick={goNext}
            >
              Next ›
            </button>
          ) : (
            <button
              type="button"
              data-field-id="wizard-submit"
              data-field-container="wizard-submit"
              className="gov-btn submit"
              onClick={() => setSubmitted(true)}
            >
              Submit Application
            </button>
          )}
        </div>
      </form>

      <Footer />
    </div>
  );
}

function Header({ appId }: { appId: string }) {
  return (
    <header className="gov-header flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 30, lineHeight: 1 }}>🛡️</span>
        <div>
          <h1 className="gov-header-title">Federal Department of Immigration</h1>
          <div className="gov-header-sub">National Immigration Services · Online Application Portal</div>
        </div>
      </div>
      <div className="text-right">
        <div className="gov-appid">Application ID: {appId}</div>
      </div>
    </header>
  );
}

function StepBar({ pages, page }: { pages: string[]; page: number }) {
  return (
    <div className="gov-steps">
      {pages.map((title, i) => (
        <div
          key={title}
          className={`gov-step ${i === page ? "active" : ""} ${i < page ? "done" : ""}`}
        >
          <span className="n">{i < page ? "✓" : i + 1}</span>
          <span className="hidden sm:inline">{title}</span>
        </div>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <footer className="gov-footer">
      © Federal Department of Immigration. All rights reserved.
      <span className="sep">|</span>Last updated 2019
      <span className="sep">|</span>Section 508 Compliant
      <span className="sep">|</span>Best viewed in Internet Explorer 11
    </footer>
  );
}

function Confirmation({ appId }: { appId: string }) {
  const [ts] = useState(() => new Date().toLocaleString());
  return (
    <div className="gov flex min-h-screen flex-col">
      <Header appId={appId} />
      <div className="flex-1">
        <div className="gov-confirm">
          <div style={{ fontSize: 40 }}>✅</div>
          <h2 className="gov-serif" style={{ color: "#14365c", fontSize: 22, margin: "8px 0" }}>
            Application Submitted
          </h2>
          <p style={{ fontSize: 13, color: "#52606d" }}>
            Your application has been received and entered into the processing queue.
          </p>
          <div style={{ margin: "18px auto", maxWidth: 360, textAlign: "left", fontSize: 13 }}>
            <Row k="Application ID" v={appId} mono />
            <Row k="Submitted" v={ts} />
            <Row k="Estimated processing time" v="8–14 weeks" />
          </div>
          <p style={{ fontSize: 12, color: "#a4262c", fontWeight: 700 }}>
            Do not contact our office regarding processing times.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e3e7ec" }}>
      <span style={{ color: "#52606d" }}>{k}</span>
      <span style={{ fontWeight: 700, fontFamily: mono ? "Courier New, monospace" : undefined }}>{v}</span>
    </div>
  );
}

function Field({
  def,
  label,
  helper,
  show,
}: {
  def: VisaFieldDef;
  label: string;
  helper?: string;
  show: boolean;
}) {
  const col = WIDTH_CLASS[def.width ?? "full"];
  const req = !def.optional && def.type !== "checkbox";

  const labelEl = (
    <label className="gov-label" htmlFor={def.id}>
      {label}
      {req && <span className="gov-req">*</span>}
    </label>
  );

  let control: React.ReactNode;
  if (def.type === "radio") {
    control = (
      <div className="gov-radio-row">
        {def.options?.map((opt) => (
          <label key={opt} className="gov-radio">
            <input type="radio" name={def.id} value={opt} data-field-id={def.id} data-field-option={opt} />
            {opt}
          </label>
        ))}
      </div>
    );
  } else if (def.type === "checkbox") {
    control = (
      <label className="gov-checkrow">
        <input type="checkbox" data-field-id={def.id} style={{ marginTop: 2 }} />
        <span>{label}</span>
      </label>
    );
  } else if (def.type === "select") {
    control = (
      <select id={def.id} data-field-id={def.id} className="gov-control" defaultValue="">
        <option value="" disabled>— Select —</option>
        {def.options?.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  } else if (def.type === "textarea") {
    control = (
      <textarea id={def.id} data-field-id={def.id} rows={def.rows ?? 3} placeholder={def.placeholder} className="gov-control" />
    );
  } else {
    control = (
      <input
        id={def.id}
        data-field-id={def.id}
        type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
        placeholder={def.placeholder}
        className="gov-control"
      />
    );
  }

  return (
    <div
      data-field-container={def.id}
      className={col}
      style={{ display: show ? "block" : "none" }}
    >
      {def.type !== "checkbox" && labelEl}
      {control}
      {helper && <div className="gov-helper">{helper}</div>}
    </div>
  );
}

import React, { useState, useMemo, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
}

export type HelpCategory = "all" | "remittance" | "invoice" | "fees" | "account" | "troubleshooting";

// ---------------------------------------------------------------------------
// FAQ data — in production would be fetched from /api/v1/help/faqs
// ---------------------------------------------------------------------------
const FAQS: FAQ[] = [
  {
    id: "1",
    question: "How do I send a remittance?",
    answer:
      "Go to Send Remittance, fill in Sender ID, Recipient ID, Amount and Currency, then click Send. You will see a conversion preview if currencies differ. All amounts are validated and fees are displayed before confirmation.",
    category: "remittance",
    keywords: ["send", "remittance", "transfer", "currency"],
  },
  {
    id: "2",
    question: "What fees are charged?",
    answer:
      "Fees include a 2.5% platform fee plus any forex and network fees. The exact breakdown is shown on the form via ConversionPreview and calculated via POST /api/v1/fees/calculate.",
    category: "fees",
    keywords: ["fee", "cost", "platform", "forex"],
  },
  {
    id: "3",
    question: "How long does a remittance take?",
    answer:
      "Most Stellar-based remittances settle within 5 seconds. Status updates are polled via usePolling (5s interval) and displayed in Transaction History.",
    category: "remittance",
    keywords: ["time", "duration", "settlement", "stellar"],
  },
  {
    id: "4",
    question: "How do I create an invoice?",
    answer:
      "Use the InvoiceViewer page. Provide sender, recipient, amount, asset and due date (UTC). Invoices track Unpaid / Paid / Overdue / Cancelled states and emit gpayremit hub events.",
    category: "invoice",
    keywords: ["invoice", "due date", "payment", "unpaid"],
  },
  {
    id: "5",
    question: "What does \"Contract Paused\" mean?",
    answer:
      "The on-chain contract can be paused during upgrades. While paused, send_remittance and generate_invoice are blocked and return ContractPaused. Upgrades bump the version and require migrate() to resume.",
    category: "troubleshooting",
    keywords: ["paused", "upgrade", "contract", "migrate"],
  },
  {
    id: "6",
    question: "How do I reset my password?",
    answer:
      "Click Forgot Password on login, enter your email, and follow the link sent to your inbox. The token expires in 1 hour and can only be used once.",
    category: "account",
    keywords: ["password", "reset", "email", "token"],
  },
  {
    id: "7",
    question: "Is my data secure?",
    answer:
      "All passwords are bcrypt-hashed (cost 12) and PII is masked in logs. JWTs are short-lived (15m) with refresh tokens (7d). MFA via TOTP is available.",
    category: "account",
    keywords: ["security", "password", "mfa", "jwt"],
  },
  {
    id: "8",
    question: "How do I export transactions?",
    answer:
      "On Transaction History, click Export. The backend streams a CSV via GET /api/v1/transactions/export with pagination and filtering support.",
    category: "remittance",
    keywords: ["export", "csv", "transaction", "history"],
  },
];

// ---------------------------------------------------------------------------
// Contextual tooltip — shown on hover/focus for in-app help
// ---------------------------------------------------------------------------
interface HelpTooltipProps {
  content: string;
  children: React.ReactElement;
  id?: string;
}

export function HelpTooltip({ content, children, id }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = id || `tooltip-${content.slice(0, 8).replace(/\s/g, "-")}`;
  const triggerRef = useRef<HTMLElement>(null);

  return (
    <span
      className="help-tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      {React.cloneElement(children as any, {
        "aria-describedby": visible ? tooltipId : undefined,
        ref: triggerRef,
        tabIndex: 0,
      })}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className="help-tooltip-bubble"
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a1a2e",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: "nowrap",
            zIndex: 1000,
            marginBottom: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {content}
        </span>
      )}
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          marginLeft: 4,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#e0e7ff",
          color: "#4338ca",
          fontSize: 11,
          alignItems: "center",
          justifyContent: "center",
          cursor: "help",
          fontWeight: 700,
        }}
      >
        ?
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Help Center
// ---------------------------------------------------------------------------
interface HelpCenterProps {
  initialCategory?: HelpCategory;
  onClose?: () => void;
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${esc})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} style={{ background: "#fef08a", padding: "0 2px" }}>
        {p}
      </mark>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

export default function HelpCenter({ initialCategory = "all", onClose }: HelpCenterProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory>(initialCategory);
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on mount and on Ctrl+K
  useEffect(() => {
    searchRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return FAQS.filter((faq) => {
      const catMatch = category === "all" || faq.category === category;
      if (!catMatch) return false;
      if (!q) return true;
      const hay = `${faq.question} ${faq.answer} ${faq.category} ${faq.keywords.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, category]);

  const categories: { label: string; value: HelpCategory }[] = [
    { label: "All", value: "all" },
    { label: "Remittance", value: "remittance" },
    { label: "Invoices", value: "invoice" },
    { label: "Fees", value: "fees" },
    { label: "Account", value: "account" },
    { label: "Troubleshooting", value: "troubleshooting" },
  ];

  return (
    <div
      className="help-center"
      role="region"
      aria-label="Help Center"
      style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 id="help-heading" style={{ margin: 0 }}>
          Help Center
        </h2>
        {onClose && (
          <button onClick={onClose} aria-label="Close help center" style={{ fontSize: 18 }}>
            ✕
          </button>
        )}
      </div>

      <p id="help-desc" style={{ color: "#64748b", marginTop: 0 }}>
        Search FAQs or browse by category. Press{" "}
        <kbd style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>Ctrl+K</kbd> to focus
        search.
      </p>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <label htmlFor="help-search" style={{ display: "none" }}>
          Search help
        </label>
        <input
          id="help-search"
          ref={searchRef}
          type="search"
          placeholder="Search FAQs… (e.g. fees, invoice, paused)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-describedby="help-desc"
          style={{
            width: "100%",
            padding: "10px 36px 10px 12px",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            style={{ position: "absolute", right: 8, top: 8, background: "#f1f5f9", borderRadius: 6, padding: "4px 8px" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Category filters */}
      <div role="group" aria-label="Filter by category" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {categories.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            aria-pressed={category === c.value}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 13,
              border: "1px solid #e2e8f0",
              background: category === c.value ? "#4338ca" : "#fff",
              color: category === c.value ? "#fff" : "#334155",
              cursor: "pointer",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div aria-live="polite" aria-atomic="true" style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
        {filtered.length} result{filtered.length !== 1 ? "s" : ""} {query && `for "${query}"`}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {filtered.map((faq) => {
          const isOpen = openId === faq.id;
          return (
            <li
              key={faq.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                marginBottom: 10,
                background: isOpen ? "#f8fafc" : "#fff",
              }}
            >
              <button
                onClick={() => setOpenId(isOpen ? null : faq.id)}
                aria-expanded={isOpen}
                aria-controls={`faq-${faq.id}`}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "14px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <span>{highlight(faq.question, query)}</span>
                <span aria-hidden="true" style={{ marginLeft: 12, color: "#64748b" }}>
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <div
                  id={`faq-${faq.id}`}
                  style={{ padding: "0 16px 14px", fontSize: 14, lineHeight: 1.6, color: "#334155" }}
                >
                  <p style={{ margin: "0 0 8px" }}>{highlight(faq.answer, query)}</p>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      background: "#e0e7ff",
                      color: "#4338ca",
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {faq.category}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 32, color: "#64748b" }}>
          <p>No results found.</p>
          <p style={{ fontSize: 13 }}>
            Try different keywords or{" "}
            <button onClick={() => { setQuery(""); setCategory("all"); }} style={{ textDecoration: "underline", color: "#4338ca" }}>
              clear filters
            </button>
            .
          </p>
        </div>
      )}

      {/* Contextual help demo */}
      <div style={{ marginTop: 32, padding: 16, background: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1" }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Contextual help example</h3>
        <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
          Hover the{" "}
          <HelpTooltip content="Fees are calculated at 2.5% + network costs">
            <span style={{ textDecoration: "underline", textDecorationStyle: "dotted" }}>fee field</span>
          </HelpTooltip>{" "}
          for inline help.
        </p>
      </div>
    </div>
  );
}

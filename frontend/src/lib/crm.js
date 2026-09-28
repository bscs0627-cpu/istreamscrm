export const LEAD_SOURCES = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "GOOGLE", label: "Google Ads" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "EXHIBITION", label: "Exhibition / Event" },
  { value: "COLD_CALL", label: "Cold Call" },
  { value: "PARTNER", label: "Partner / Reseller" },
  { value: "EXISTING_CUSTOMER", label: "Existing Customer" },
  { value: "IMPORT", label: "Excel Import" },
  { value: "OTHER", label: "Other" },
];

export const LEAD_STATUSES = [
  { value: "NEW", label: "New", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  { value: "CONTACTED", label: "Contacted", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  { value: "DEMO_SCHEDULED", label: "Demo Scheduled", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "DEMO_DONE", label: "Demo Done", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "REQUIREMENTS", label: "Requirements", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  { value: "QUOTATION_SENT", label: "Quotation Sent", cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  { value: "NEGOTIATION", label: "Negotiation", cls: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300" },
  { value: "WON", label: "Won", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "NO_ANSWER", label: "No Answer", cls: "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300" },
  { value: "FOLLOW_UP_LATER", label: "Follow-up Later", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
  { value: "NOT_INTERESTED", label: "Not Interested", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
  { value: "LOST", label: "Lost", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
];

export const CLOSED_STATUSES = ["WON", "NOT_INTERESTED", "LOST"];

export const PRIORITIES = [
  { value: "HOT", label: "Hot", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  { value: "WARM", label: "Warm", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "COLD", label: "Cold", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
];

export const LOST_REASONS = [
  { value: "PRICE", label: "Price too high" },
  { value: "COMPETITOR", label: "Chose a competitor" },
  { value: "NO_BUDGET", label: "No budget" },
  { value: "FEATURES", label: "Missing features" },
  { value: "NO_DECISION", label: "No decision / postponed" },
  { value: "NOT_REACHABLE", label: "Not reachable" },
  { value: "JUNK", label: "Junk / fake lead" },
  { value: "OTHER", label: "Other" },
];

export const DEPLOYMENTS = [
  { value: "CLOUD", label: "Cloud" },
  { value: "ON_PREMISE", label: "On-premise" },
  { value: "ANY", label: "Either" },
];

export const FOLLOW_UP_TYPES = [
  { value: "CALL", label: "Call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Meeting" },
  { value: "DEMO", label: "Demo" },
];

export const CALL_OUTCOMES = [
  { value: "ANSWERED", label: "Answered" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "BUSY", label: "Busy" },
  { value: "SWITCHED_OFF", label: "Switched off" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
];

export const ITEM_TYPES = [
  { value: "LICENSE", label: "License" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "IMPLEMENTATION", label: "Implementation" },
  { value: "CUSTOMIZATION", label: "Customization" },
  { value: "AMC", label: "AMC / Support" },
  { value: "TRAINING", label: "Training" },
  { value: "HARDWARE", label: "Hardware" },
  { value: "OTHER", label: "Other" },
];

export const UNITS = [
  { value: "PER_LICENSE", label: "per license" },
  { value: "PER_USER", label: "per user" },
  { value: "PER_USER_MONTH", label: "per user / month" },
  { value: "PER_USER_YEAR", label: "per user / year" },
  { value: "PER_MONTH", label: "per month" },
  { value: "PER_YEAR", label: "per year" },
  { value: "PER_HOUR", label: "per hour" },
  { value: "PER_DAY", label: "per day" },
  { value: "FIXED", label: "fixed price" },
];

export const PRODUCT_CATEGORIES = ["ERP", "HRMS", "CRM", "POS", "Accounting", "Inventory", "Mobile App", "Website", "Services", "Other"];

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

export const INDUSTRIES = [
  "Trading", "Manufacturing", "Construction", "Contracting", "Retail", "Restaurant / F&B", "Hospitality", "Healthcare",
  "Education", "Logistics", "Real Estate", "Automotive", "Oil & Gas", "Professional Services", "IT", "Government", "Other",
];

export const QUOTE_STATUSES = [
  { value: "DRAFT", label: "Draft", cls: "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300" },
  { value: "SENT", label: "Sent", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "ACCEPTED", label: "Accepted", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "REJECTED", label: "Rejected", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  { value: "REVISED", label: "Revised", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
];

// An issued invoice is shown by its payment state; drafts and cancelled ones by their status.
export const INVOICE_STATES = [
  { value: "DRAFT", label: "Draft", cls: "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300" },
  { value: "UNPAID", label: "Unpaid", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "PARTIAL", label: "Partly paid", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "OVERDUE", label: "Overdue", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  { value: "PAID", label: "Paid", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "CANCELLED", label: "Cancelled", cls: "bg-gray-200 text-gray-500 line-through dark:bg-slate-700 dark:text-gray-400" },
];
export const invoiceStateOf = (i) => INVOICE_STATES.find((x) => x.value === i.paymentStatus) ?? INVOICE_STATES[0];

export const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online payment" },
];

export const BILLING_CYCLES = [
  { value: "MONTHLY", label: "Monthly", months: 1 },
  { value: "QUARTERLY", label: "Quarterly", months: 3 },
  { value: "YEARLY", label: "Yearly", months: 12 },
];

export const SUBSCRIPTION_STATES = [
  { value: "ACTIVE", label: "Active", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "DUE", label: "Due for renewal", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "EXPIRED", label: "Expired", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  { value: "CANCELLED", label: "Cancelled", cls: "bg-gray-200 text-gray-500 line-through dark:bg-slate-700 dark:text-gray-400" },
];
export const subscriptionStateOf = (s) => SUBSCRIPTION_STATES.find((x) => x.value === s.state) ?? SUBSCRIPTION_STATES[0];

export const TICKET_TYPES = [
  { value: "SUPPORT", label: "Support", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  { value: "CHANGE", label: "Change request", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
];

export const TICKET_CATEGORIES = [
  { value: "BUG", label: "Bug / error", type: "SUPPORT" },
  { value: "HOW_TO", label: "How-to question", type: "SUPPORT" },
  { value: "DATA_FIX", label: "Data correction", type: "SUPPORT" },
  { value: "ACCESS", label: "Login / access", type: "SUPPORT" },
  { value: "PERFORMANCE", label: "Slow / performance", type: "SUPPORT" },
  { value: "NEW_FEATURE", label: "New feature", type: "CHANGE" },
  { value: "REPORT", label: "Report / print format", type: "CHANGE" },
  { value: "INTEGRATION", label: "Integration", type: "CHANGE" },
  { value: "OTHER", label: "Other" },
];

export const TICKET_PRIORITIES = [
  { value: "LOW", label: "Low", sla: "5 days", cls: "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300" },
  { value: "MEDIUM", label: "Medium", sla: "3 days", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "HIGH", label: "High", sla: "24 hours", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "URGENT", label: "Urgent", sla: "4 hours", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
];

export const TICKET_CHANNELS = [
  { value: "PHONE", label: "Phone call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "OTHER", label: "Other / visit" },
];

const TS = (value, label, cls) => ({ value, label, cls });
export const TICKET_STATUSES = [
  TS("OPEN", "Open", "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"),
  TS("ESTIMATED", "Estimated", "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"),
  TS("APPROVED", "Approved", "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"),
  TS("IN_PROGRESS", "In progress", "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"),
  TS("WAITING", "Waiting on customer", "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"),
  TS("TESTING", "Testing", "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"),
  TS("RESOLVED", "Resolved", "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"),
  TS("CLOSED", "Closed", "bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300"),
  TS("REJECTED", "Rejected", "bg-gray-200 text-gray-500 line-through dark:bg-slate-700 dark:text-gray-400"),
];
export const SUPPORT_FLOW = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];
export const CHANGE_FLOW = ["OPEN", "ESTIMATED", "APPROVED", "IN_PROGRESS", "WAITING", "TESTING", "RESOLVED", "CLOSED", "REJECTED"];
export const TICKET_DONE = ["RESOLVED", "CLOSED", "REJECTED"];
// A resolved change request has been delivered.
export function ticketStatusOf(status, type) {
  const s = TICKET_STATUSES.find((x) => x.value === status) ?? TICKET_STATUSES[0];
  return type === "CHANGE" && status === "RESOLVED" ? { ...s, label: "Delivered" } : s;
}

export const quoteStatusOf =(s) => QUOTE_STATUSES.find((x) => x.value === s) ?? QUOTE_STATUSES[0];

// Same rounding as the API: per line, 2 decimals.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function quoteLine(l) {
  const gross = round2(round2(Number(l.quantity) || 0) * round2(Number(l.unitPrice) || 0));
  const discount = round2(gross * round2(Number(l.discountPct) || 0) / 100);
  const net = round2(gross - discount);
  const vat = round2(net * round2(Number(l.vatPct) || 0) / 100);
  return { gross, discount, net, vat };
}
export function quoteTotals(lines) {
  return lines.reduce((t, l) => {
    const m = quoteLine(l);
    return { subtotal: round2(t.subtotal + m.gross), discount: round2(t.discount + m.discount), vat: round2(t.vat + m.vat), total: round2(t.total + m.net + m.vat) };
  }, { subtotal: 0, discount: 0, vat: 0, total: 0 });
}

export const labelOf =(list, value) => list.find((x) => x.value === value)?.label ?? value ?? "";

const aed = new Intl.NumberFormat("en-AE", { maximumFractionDigits: 2 });
export const formatAed = (n) => (n === null || n === undefined || n === "" ? "" : `AED ${aed.format(n)}`);
export const formatNumber = (n) => (n === null || n === undefined || n === "" ? "" : aed.format(n));

const shortAed = (n) => (n >= 1000000 ? `${+(n / 1000000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(0)}K` : `${n}`);

// "ERP Cloud, Implementation · 25 users · Cloud · AED 50K"
export function requirementSummary(l) {
  return [
    l.productNames || l.title,
    l.usersCount && `${l.usersCount} users`,
    l.deployment && labelOf(DEPLOYMENTS, l.deployment),
    (l.expectedValue || l.budget) && `AED ${shortAed(l.expectedValue || l.budget)}`,
  ].filter(Boolean).join(" · ");
}

// "AED 1,200 per user / year"
export const priceLabel = (p) => `${formatAed(p.price)} ${labelOf(UNITS, p.unit)}`;

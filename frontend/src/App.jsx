import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, MessagesSquare, Contact, Users, NotebookPen, MessageCircle, ShieldAlert, LogOut, Mail, AtSign,
  Building2, Package, Target, CalendarClock, BarChart3, FileText, Landmark, Receipt, Wallet, Repeat, LifeBuoy,
  PanelLeft, X, Sun, Moon, Maximize, Minimize,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/Auth/LoginPage";
import DashboardPage from "@/pages/Dashboard/DashboardPage";
import InboxPage from "@/pages/Inbox/InboxPage";
import CustomersPage from "@/pages/Customers/CustomersPage";
import StaffPage from "@/pages/Staff/StaffPage";
import NotesPage from "@/pages/Notes/NotesPage";
import WhatsAppSettingsPage from "@/pages/WhatsAppSettings/WhatsAppSettingsPage";
import EmailInboxPage from "@/pages/EmailInbox/EmailInboxPage";
import EmailSettingsPage from "@/pages/EmailSettings/EmailSettingsPage";
import SuperAdminPage from "@/pages/SuperAdmin/SuperAdminPage";
import AccountsPage from "@/pages/Accounts/AccountsPage";
import AccountFormPage from "@/pages/Accounts/AccountFormPage";
import ProductsPage from "@/pages/Products/ProductsPage";
import QuotationsPage from "@/pages/Quotations/QuotationsPage";
import QuotationEditorPage from "@/pages/Quotations/QuotationEditorPage";
import CompanyProfilePage from "@/pages/CompanyProfile/CompanyProfilePage";
import InvoicesPage from "@/pages/Invoices/InvoicesPage";
import InvoiceEditorPage from "@/pages/Invoices/InvoiceEditorPage";
import ReceivablesPage from "@/pages/Receivables/ReceivablesPage";
import SubscriptionsPage from "@/pages/Subscriptions/SubscriptionsPage";
import TicketsPage from "@/pages/Tickets/TicketsPage";
import TicketDetailPage from "@/pages/Tickets/TicketDetailPage";
import LeadsPage from "@/pages/Leads/LeadsPage";
import LeadDetailPage from "@/pages/Leads/LeadDetailPage";
import ImportLeadsPage from "@/pages/Leads/ImportLeadsPage";
import FollowUpsPage from "@/pages/FollowUps/FollowUpsPage";
import ReportsPage from "@/pages/Reports/ReportsPage";

// access: "all" | "admin" | "super"
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, access: "all" },
  { to: "/inbox", label: "WhatsApp Inbox", icon: MessagesSquare, access: "all" },
  { to: "/email-inbox", label: "Email Inbox", icon: Mail, access: "all" },
  { to: "/leads", label: "Leads", icon: Target, access: "all" },
  { to: "/follow-ups", label: "Follow-ups", icon: CalendarClock, access: "all" },
  { to: "/quotations", label: "Quotations", icon: FileText, access: "all" },
  { to: "/invoices", label: "Invoices", icon: Receipt, access: "all" },
  { to: "/receivables", label: "Receivables", icon: Wallet, access: "all" },
  { to: "/subscriptions", label: "Subscriptions", icon: Repeat, access: "all" },
  { to: "/tickets", label: "Tickets", icon: LifeBuoy, access: "all" },
  { to: "/accounts", label: "Customers", icon: Building2, access: "all" },
  { to: "/customers", label: "Contacts", icon: Contact, access: "all" },
  { to: "/products", label: "Products", icon: Package, access: "all" },
  { to: "/reports", label: "Reports", icon: BarChart3, access: "all" },
  { to: "/staff", label: "Staff", icon: Users, access: "admin" },
  { to: "/notes", label: "Notes", icon: NotebookPen, access: "all" },
  { to: "/whatsapp-settings", label: "WhatsApp Settings", icon: MessageCircle, access: "admin" },
  { to: "/email-settings", label: "Email Settings", icon: AtSign, access: "admin" },
  { to: "/company-profile", label: "Company Profile", icon: Landmark, access: "admin" },
  { to: "/superadmin", label: "Super Admin", icon: ShieldAlert, access: "super" },
];

function allowed(access, { isAdmin, isSuperAdmin }) {
  if (access === "super") return isSuperAdmin;
  if (access === "admin") return isAdmin;
  return true;
}

function RequireAuth({ access, children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!auth.isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!allowed(access, auth)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Not authorised</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You don’t have access to this page.</p>
      </div>
    );
  }
  return children;
}

function Sidebar({ open, collapsed, onClose }) {
  const auth = useAuth();
  const { unread, emailUnread, followUpsDue } = auth;
  const badges = { "/inbox": unread, "/email-inbox": emailUnread, "/follow-ups": followUpsDue };
  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-blue-600 text-white"
        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800"
    }`;

  return (
    <>
    {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />}
    <aside className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 transform transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:hidden" : ""} border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col`}>
      <div className="flex items-center gap-2 mb-1 px-2">
        <MessageCircle className="h-6 w-6 shrink-0 text-green-600" />
        <span className="flex-1 text-base font-bold leading-tight text-gray-900 dark:text-white">iStreams CRM</span>
        <button onClick={onClose} className="md:hidden text-gray-500" aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <div className="mb-6" />

      <nav className="space-y-1 flex-1 overflow-y-auto">
        {NAV.filter((n) => allowed(n.access, auth)).map((n) => (
          <NavLink key={n.to} to={n.to} className={linkClass} onClick={onClose}>
            <n.icon className="h-4 w-4" />
            <span className="flex-1">{n.label}</span>
            {badges[n.to] > 0 && (
              <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white ${n.to === "/inbox" ? "bg-green-600" : n.to === "/follow-ups" ? "bg-red-600" : "bg-blue-600"}`}>
                {badges[n.to] > 99 ? "99+" : badges[n.to]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

    </aside>
    </>
  );
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* storage unavailable */ }
    setDark(next);
  };
  return [dark, toggle];
}

function useFullscreen() {
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  return [full, toggle];
}

function labelTables(root) {
  root.querySelectorAll("table").forEach((t) => {
    const heads = [...t.querySelectorAll("thead th")].map((h) => h.textContent.trim());
    if (!heads.length) return;
    t.querySelectorAll("tbody tr").forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        if (td.colSpan === 1 && heads[i] && td.dataset.label !== heads[i]) td.dataset.label = heads[i];
      });
    });
  });
}

function Shell({ children }) {
  const mainRef = useRef(null);
  useEffect(() => {
    const el = mainRef.current;
    let frame = 0;
    const run = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => labelTables(el)); };
    const observer = new MutationObserver(run);
    observer.observe(el, { childList: true, subtree: true });
    run();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, toggleTheme] = useTheme();
  const [full, toggleFull] = useFullscreen();
  const btn = "rounded-lg p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800";
  return (
    <div className="flex h-full bg-gray-50 dark:bg-slate-950">
      <Sidebar open={menu} collapsed={collapsed} onClose={() => setMenu(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="shrink-0 flex items-center gap-2 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
          <button onClick={() => (matchMedia("(min-width: 768px)").matches ? setCollapsed((c) => !c) : setMenu(true))} className={btn} aria-label="Toggle menu">
            <PanelLeft className="h-5 w-5" />
          </button>
          <span className="ml-1 text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.companyName}</span>
          <span className="hidden sm:inline rounded-md bg-slate-900 dark:bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white whitespace-nowrap">
            {user?.isSuperAdmin === "T" ? "Super Admin Mode" : user?.role === "ADMIN" ? "Admin Mode" : "Staff Mode"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggleFull} className={`${btn} hidden sm:block`} title={full ? "Exit full screen" : "Full screen"} aria-label="Toggle full screen">
              {full ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
            <button onClick={toggleTheme} className={btn} title={dark ? "Light theme" : "Dark theme"} aria-label="Toggle theme">
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200 dark:border-slate-800">
              <div className="h-9 w-9 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                {(user?.fullName || "?").trim().charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block leading-tight max-w-[10rem]">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.fullName}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</div>
              </div>
              <button onClick={logout} className={btn} title="Sign out" aria-label="Sign out"><LogOut className="h-5 w-5" /></button>
            </div>
          </div>
        </header>
        <main ref={mainRef} className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

const page = (element, access = "all") => (
  <RequireAuth access={access}>
    <Shell>{element}</Shell>
  </RequireAuth>
);

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated && !loading ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/signup" element={<Navigate to="/login?tab=signup" replace />} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={page(<DashboardPage />)} />
      <Route path="/inbox" element={page(<InboxPage />)} />
      <Route path="/email-inbox" element={page(<EmailInboxPage />)} />
      <Route path="/customers" element={page(<CustomersPage />)} />
      <Route path="/leads" element={page(<LeadsPage />)} />
      <Route path="/leads/import" element={page(<ImportLeadsPage />, "admin")} />
      <Route path="/leads/:id" element={page(<LeadDetailPage />)} />
      <Route path="/follow-ups" element={page(<FollowUpsPage />)} />
      <Route path="/accounts" element={page(<AccountsPage />)} />
      <Route path="/accounts/new" element={page(<AccountFormPage />)} />
      <Route path="/accounts/:id/edit" element={page(<AccountFormPage />)} />
      <Route path="/products" element={page(<ProductsPage />)} />
      <Route path="/quotations" element={page(<QuotationsPage />)} />
      <Route path="/quotations/:id" element={page(<QuotationEditorPage />)} />
      <Route path="/invoices" element={page(<InvoicesPage />)} />
      <Route path="/invoices/:id" element={page(<InvoiceEditorPage />)} />
      <Route path="/receivables" element={page(<ReceivablesPage />)} />
      <Route path="/subscriptions" element={page(<SubscriptionsPage />)} />
      <Route path="/tickets" element={page(<TicketsPage />)} />
      <Route path="/tickets/:id" element={page(<TicketDetailPage />)} />
      <Route path="/company-profile" element={page(<CompanyProfilePage />, "admin")} />
      <Route path="/reports" element={page(<ReportsPage />)} />
      <Route path="/staff" element={page(<StaffPage />, "admin")} />
      <Route path="/notes" element={page(<NotesPage />)} />
      <Route path="/whatsapp-settings" element={page(<WhatsAppSettingsPage />, "admin")} />
      <Route path="/email-settings" element={page(<EmailSettingsPage />, "admin")} />
      <Route path="/superadmin" element={page(<SuperAdminPage />, "super")} />

      <Route path="*" element={page(<div className="p-8">Not found</div>)} />
    </Routes>
  );
}

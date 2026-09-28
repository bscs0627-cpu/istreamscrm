# iStreams CRM — for a software company

CRM for selling software, subscriptions and services: companies and contacts, a product price list,
leads with a demo → quotation → negotiation pipeline, follow-ups, reports, and a shared WhatsApp + Email
inbox with a bot that qualifies new enquiries. Built from the iStreams real-estate CRM (WhatsApp CRM).

- `api/` — .NET 8 Web API (Dapper, JWT) on http://localhost:5197
- `frontend/` — React 18 + Vite + Tailwind on http://localhost:5198
- `database/` — SQL scripts for the `istreams_crm` database (tables prefixed `wsm_`)

The ports differ from the real-estate CRM (5097 / 5098), so both can run on one machine.

## First-time setup

1. Run the database scripts in order (script 01 creates the `istreams_crm` database):
   ```
   sqlcmd -I -S "(localdb)\MSSQLLocalDB" -i database/01_schema.sql
   sqlcmd -I -S "(localdb)\MSSQLLocalDB" -i database/02_email_inbox.sql
   sqlcmd -I -S "(localdb)\MSSQLLocalDB" -i database/03_products.sql
   sqlcmd -I -S "(localdb)\MSSQLLocalDB" -i database/04_leads.sql
   sqlcmd -I -S "(localdb)\MSSQLLocalDB" -i database/05_quotations.sql
   sqlcmd -I -S "(localdb)\MSSQLLocalDB" -i database/06_invoices.sql
   ```
2. Create `api/appsettings.Development.json` (not committed):
   ```json
   {
     "Jwt": { "Key": "<random string, 32+ characters>" },
     "Smtp": { "User": "you@gmail.com", "Password": "<Gmail App Password>", "From": "you@gmail.com" }
   }
   ```
3. `cd frontend && npm install` (`frontend/.env` points the app at `http://localhost:5197/api`).

## Run

```
cd api && dotnet run
cd frontend && npm run dev
```

## What's inside

| Menu | What it does |
|---|---|
| Dashboard | Today's follow-ups and demos, new / unassigned / cold leads, recent activity, this month's deals, pipeline, chats, staff |
| WhatsApp / Email Inbox | Shared inbox; staff see their own contacts |
| Leads | Pipeline New → Contacted → Demo Scheduled → Demo Done → Requirements → Quotation Sent → Negotiation → Won / Lost; products of interest, users, cloud / on-premise, budget, decision date; timeline and follow-ups; Excel / CSV import and bulk assign |
| Follow-ups | Overdue / today / upcoming calls, demos, meetings |
| Quotations | QT-2026-0001 from a lead's products (quantity = users for per-user prices); discount and 5% VAT per line; revisions R1, R2…; admin approval above the discount limit; PDF with your logo, bank details and terms; send by email (attached) or WhatsApp (document); Accepted wins the lead at the value before VAT |
| Invoices | UAE tax invoices from an accepted quotation: full, or a share such as a 50% advance and the balance; the INV-2026-0001 number is given only on **Issue** (drafts leave no gap) and the buyer's name / TRN / address are frozen then; issued invoices are cancelled, never edited; PDF by email / WhatsApp, payment reminders; payments by bank transfer, cheque, cash, card (admins) |
| Receivables | Outstanding balances by customer: not yet due, 1–30, 31–60, 61–90, 90+ days overdue |
| Company Profile | Your legal name, TRN, address, bank, logo, quotation validity, discount limit and default quotation and invoice terms, invoice due days (admins) |
| Companies | Customer businesses with UAE TRN, industry, size, address; their contacts and leads |
| Contacts | People at those companies (job title), including everyone who wrote on WhatsApp or email |
| Products | Price list: licenses, subscriptions, implementation, customization, AMC, training — price in AED, unit, VAT % |
| Reports | New leads, conversion, deals won / lost, deal value, by status, source and agent |

**WhatsApp bot:** a new number is asked for name → email → company → which solution (a numbered list of the
product categories) → number of users, and becomes an unassigned lead. **Email:** a new sender becomes an
unassigned lead titled with the email subject.

PDFs are made with [QuestPDF](https://www.questpdf.com) under its free Community licence (companies below USD 1M
annual revenue); above that a paid QuestPDF licence is required.

## Roles

| Role | Signs in with | Access |
|---|---|---|
| Super Admin | Admin tab: email + password | Approve / suspend companies (Super Admin page) |
| Admin | Admin tab: email + password | Everything, including price list, assignment, staff, settings |
| Staff | Staff tab: company admin email + own mobile + password | Their own leads, contacts, chats and follow-ups |

New sign-ups create a company in **Pending** status; a Super Admin approves it before anyone can sign in.

## Connecting WhatsApp

1. WhatsApp Settings: fill Phone Number ID, WABA ID, Access Token, Verify Token, App Secret → Save → Verify Connection.
2. Meta App → WhatsApp → Configuration → Webhook: paste the **Callback URL** shown on the settings page
   (`https://<public-host>/api/whatsapp/webhook/<company-code>`) and the same Verify Token. Subscribe to `messages`.
3. For local testing expose the API with `ngrok http 5197`.

## Connecting Email

1. Email Settings: fill Email Address, Username, Password, IMAP / SMTP servers → Save → Verify Connection.
   For Gmail turn on 2-Step Verification and use an App Password; IMAP `imap.gmail.com:993`, SMTP `smtp.gmail.com:587`.
2. The API checks every connected mailbox once a minute. Only mail that arrives **after** Verify Connection is imported.

## Roadmap

Subscriptions and renewals → support tickets and change requests → dashboard and reports for all of it.

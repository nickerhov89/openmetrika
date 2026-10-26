# CRM outcomes and business analytics (v0.2)

The **Лиды и прибыль** section combines confirmed sales outcomes with collected
visitor IDs and imported advertising costs. It does not create a sale from a
public browser event and does not automatically connect an amoCRM account.
Use your server, n8n or CRM webhook adapter to translate vendor events into this
API. No personal names, email addresses or phone numbers are needed.

## Connect

1. Capture `om('getClientId')` after consent and send it to your own lead endpoint.
   Store it alongside your CRM lead. Existing browser tracking alone does not
   link a lead to CRM; your form/server must carry the ID.
2. As counter owner, open **Лиды и прибыль → Подключить CRM**, create an import key
   and store it only on your server. Keys are shown once and stored as SHA-256.
3. POST JSON to `/api/sites/SITE_ID/business/import` using
   `Authorization: Bearer IMPORT_KEY`. Use HTTPS outside localhost.

```json
{
  "events": [
    {
      "event_id": "amo-101-created",
      "lead_id": "amo-101",
      "visitor": "CLIENT_ID_FROM_OM",
      "stage": "lead",
      "ts": "2026-10-20T09:00:00Z",
      "currency": "RUB"
    },
    {
      "event_id": "amo-101-qualified",
      "lead_id": "amo-101",
      "stage": "qualified",
      "ts": "2026-10-20T10:00:00Z",
      "currency": "RUB"
    },
    {
      "event_id": "amo-101-payment-1",
      "lead_id": "amo-101",
      "stage": "paid",
      "ts": "2026-10-21T12:00:00Z",
      "revenue": 150000,
      "cost": 60000,
      "currency": "RUB"
    }
  ]
}
```

Replace example dates and IDs with real values. `ts` is an ISO timestamp with
timezone or Unix milliseconds, not Unix seconds. Future timestamps beyond one
minute are rejected. An import contains 1–1,000 events. `session` may identify a
specific visit instead of `visitor`; it must belong to the counter and match the
visitor if both are supplied. Browser visitor/session IDs must match the tracker
format. Lead/event IDs accept 1–100 ASCII word characters, `.`, `:`, `-`.

Stages: `lead`, `qualified`, `meeting`, `won`, `paid`, `refund`, `lost`.
Missing intermediate stages are not invented. Send actual stage transitions;
stage metrics count unique leads that reached each recorded stage, not a strict
sequential funnel. A later `lost` event does not erase a historical payment.

Every event is an **increment**, not a repeated cumulative total. A paid event
adds its revenue; a refund subtracts its positive revenue amount. Direct costs
are positive expenses summed across events. Do not repeat the full lifetime
cost/revenue on each status update. A `won` amount is not counted as payment.

Retries with the same event ID and financial content return a duplicate without
adding money. Reusing an ID for different content rejects the whole batch.
Validation and inserts are transactional. Use new IDs for new transactions;
corrections should be explicit adjustment/refund events rather than overwrites.
One lead has one currency. Separate currencies are never added together.

## Permissions and privacy

Import keys can call **only POST business/import for their counter**. They cannot
read reports, create users/keys, import ad costs or access another counter.
Existing BI/reporting keys still permit GET only. Owners can also import through
their authenticated dashboard; editors/viewers cannot import sales outcomes.
The public read-only demo mode rejects imports and other API mutations.

Owners can revoke keys and erase one imported lead with its entire event history:
`DELETE /api/sites/SITE_ID/business/leads/LEAD_ID`. This requires an owner session,
not an integration key, and cannot be undone through the product UI.

Web-visit retention does not delete the financial history. Sales outcomes persist
until owner erasure; define your financial retention policy and include this
database in backups. Purging a web visit does not automatically erase CRM history.
When consent/identity is unavailable, import without a visitor: the lead remains
**Не атрибутировано**. No fingerprinting or hidden cross-device merging occurs.

## Report definitions

GET `/api/sites/SITE_ID/business` supports period, source and campaign. It rejects
visit-only segments rather than pretending their costs can be allocated correctly.

- `businessBasis=cohort` (default): leads created in the chosen period, with all
  supplied outcomes through now. Costs are calendar-period costs; this is not a
  full campaign-lifetime allocation of every touch.
- `businessBasis=event`: outcomes occurring in the chosen period; lead counts mean
  leads with activity in that period, not newly acquired leads.
- `attribution=first`: first recorded touch within `attributionDays=7|30|90` before
  lead creation (90 by default).
- `attribution=last`: last non-direct touch in that window, otherwise last direct
  touch. When no identity history exists, a supplied visit can be a fallback.
- `format=csv`: export all channel aggregates as spreadsheet-safe CSV. The UI
  limits the lead history list to 250; aggregate totals/cohorts use all matches.

Revenue = payments − refunds. Gross profit = revenue − supplied direct costs.
Contribution after marketing = gross profit − imported advertising costs.
ROMI = contribution / advertising costs × 100%. CPQL and meeting cost use recorded
qualified leads and meetings. Customer acquisition cost is per paying **lead**;
multiple CRM leads for one customer are not automatically deduplicated.

Absent ad costs yield unknown unit costs/ROMI, while an explicitly imported zero
is preserved. No margin is trustworthy without complete direct costs. Weekly
cohorts use lead-creation weeks and show time to first payment only among paid
leads. Younger cohorts have had less time to convert; this is not mature LTV.

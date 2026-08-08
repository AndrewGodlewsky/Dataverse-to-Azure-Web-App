# Sample Dataverse Table Configurations

Resolves [Inventory the target Dataverse tables (#6)](https://github.com/AndrewGodlewsky/Dataverse-to-Azure-Web-App/issues/6)
as redefined: no real inventory exists, so these four **synthetic configurations**
stand in for it. Together they cover every Dataverse column type, every relationship
kind (1:N, N:N native, N:N manual intersect, self-referential, polymorphic), and the
row-count/velocity tiers that flip the live-vs-copy rubric from
[001-data-egress-options.md](001-data-egress-options.md). The atlas
([Synthesize the options atlas (#7)](https://github.com/AndrewGodlewsky/Dataverse-to-Azure-Web-App/issues/7))
weights the rubric **per configuration** — a real schema is then matched to whichever
configuration it most resembles.

## Why these four

Each configuration is chosen to stress a different rubric criterion:

| Config | Archetype | Stresses |
|---|---|---|
| A | Reference & config mesh | Nothing — the floor case; everything works |
| B | Transactional parent-child (sales-style) | Aggregation caps, rollups, polymorphic lookups |
| C | High-volume event stream | The 50k aggregate cap, paging, elastic tables |
| D | Deep hierarchy & documents | Hierarchy operators, N:N-with-attributes, file columns |

---

## Configuration A — Reference & config mesh (small, slow-moving)

Small lookup tables every dashboard needs. The floor case: any egress path handles it.

| Table | ~Rows | Key columns (type) | Relationships |
|---|---|---|---|
| `Region` | 50 | Name (text), Code (autonumber), IsActive (yes/no) | 1:N → Department |
| `Department` | 300 | Name (text), CostCenter (text), Region (lookup), Icon (image) | N:1 Region; 1:N → B.Account owner teams |
| `ProductCategory` | 800 | Name (text), Tier (choice), Tags (multi-select choice), Thumbnail (image) | self-ref lookup ParentCategory; 1:N → B.Product |
| `AppSetting` | 40 | Key (text), Value (multiline text), EffectiveFrom (date only) | none |

**Facts for the rubric:** total <2k rows; changes weekly at most; no sensitive fields;
aggregations trivially under every cap. Staleness tolerance: days.

**Sample data — `ProductCategory`:**

| Name | Tier | Tags | ParentCategory |
|---|---|---|---|
| Industrial Pumps | Core | rotating;fluid | — |
| Centrifugal | Core | rotating | Industrial Pumps |
| Seals & Gaskets | Accessory | consumable | — |

---

## Configuration B — Transactional parent-child (the sales-style core)

The classic operational spine: multi-level parent-child, money everywhere, the
polymorphic Customer lookup, calculated and rollup columns.

| Table | ~Rows | Key columns (type) | Relationships |
|---|---|---|---|
| `Account` | 20k | Name (text), CreditLimit (currency, **column security**), Rating (choice), TotalOrderValue (**rollup** over Orders), Owner (owner) | 1:N → Contact, Order; N:N ↔ `Supplier` (native) |
| `Contact` | 80k | FullName (text), Email (text), Birthdate (date only), Preferences (multi-select choice), ParentAccount (lookup) | N:1 Account |
| `Order` | 250k | OrderNumber (autonumber), Customer (**polymorphic lookup**: Account OR Contact), OrderDate (date/time, user-local), Status (status reason), Discount (decimal), ExchangeRate (currency pair) | N:1 Customer; 1:N → OrderLine |
| `OrderLine` | 1.2M | Product (lookup), Qty (whole number), UnitPrice (currency), LineTotal (**formula**: Qty×UnitPrice), Weight (float) | N:1 Order, N:1 Product |
| `Product` | 5k | Name (text), SKU (text), Category (lookup → A.ProductCategory), ListPrice (currency), Spec (file) | N:N ↔ Account(as Supplier) |
| `Invoice` | 240k | Order (lookup), DueDate (date, timezone-independent), Paid (yes/no), Balance (currency) | N:1 Order |

**Facts for the rubric:** OrderLine at 1.2M rows means **any unfiltered aggregation
exceeds the 50k live-path cap** — dashboard KPIs like "revenue by month, all time"
hard-error on Web API/TDS unless pre-filtered below 50k rows per aggregate scope.
Filtered views (one account's orders) stay live-friendly. Change velocity: hundreds
of writes/hour business hours. Staleness tolerance: minutes-to-hour for KPIs.
Sensitive: `Account.CreditLimit` under column security — an application user needs
explicit column-security-profile membership to read it, and it must be *excluded*
from any exported copy unless the copy store enforces equivalent control.

**Sample data — `Order` (note the polymorphic Customer):**

| OrderNumber | Customer | OrderDate | Status | Total |
|---|---|---|---|---|
| ORD-04412 | Account: "Contoso Manufacturing" | 2026-07-14 09:31 | Fulfilled | $12,480.00 |
| ORD-04413 | Contact: "Rina Patel" | 2026-07-14 10:02 | Pending | $310.50 |

---

## Configuration C — High-volume event stream (the cap-breaker)

Machine-generated rows: telemetry, audit events, status pings. The configuration
that disqualifies live paths for analytics.

| Table | ~Rows | Key columns (type) | Relationships |
|---|---|---|---|
| `DeviceReading` (**elastic table**) | 8M+/yr | DeviceId (text, partition key), ReadingTime (date/time, TZ-independent), Payload (**JSON column**), Value (float), TTL (auto-delete) | logical ref → `Device` by id (elastic tables don't do real lookups) |
| `Device` | 12k | Serial (autonumber), Site (lookup → D.OrgUnit), Model (choice), CommissionedOn (date only) | N:1 OrgUnit |
| `AlertCase` | 90k/yr | Device (lookup), Severity (choice), RaisedAt (date/time user-local), Note (multiline text) | N:1 Device; **activity-style Regarding pattern** |

**Facts for the rubric:** 8M rows/yr is 160× the 50k aggregate cap — live-path
analytics is impossible beyond narrow slices; even paged extraction via Web API
(5,000/page, no `$skip`) is impractical for backfills. **Elastic tables are excluded
from the TDS endpoint entirely** (egress research), so T-SQL never sees them live.
Append-only, high velocity (hundreds of rows/min). Staleness tolerance: 15–60 min is
typically fine for trend dashboards — exactly the Synapse/Fabric Link window.
Synapse Link note: change tracking prerequisite and append-only mode align naturally
with this shape.

**Sample data — `DeviceReading`:**

| DeviceId | ReadingTime | Value | Payload |
|---|---|---|---|
| DEV-0117 | 2026-08-07T03:12:00Z | 71.4 | `{"unit":"psi","q":0.98,"fw":"2.4.1"}` |
| DEV-0117 | 2026-08-07T03:13:00Z | 71.9 | `{"unit":"psi","q":0.97,"fw":"2.4.1"}` |

---

## Configuration D — Deep hierarchy & documents (the structure-heavy case)

Self-referencing trees, N:N with attributes, and file/document columns.

| Table | ~Rows | Key columns (type) | Relationships |
|---|---|---|---|
| `OrgUnit` | 900 | Name (text), Parent (**self-referential lookup, hierarchy-enabled**), Head (lookup → Employee) | tree depth ~6 |
| `Employee` | 15k | FullName (text), Manager (**self-ref lookup, hierarchy-enabled**), HireDate (date only), Salary (currency, **column security**), Photo (image), Skills (multi-select choice) | N:1 OrgUnit |
| `Part` | 30k | PartNo (text), Unit (choice), Drawing (**file**) | N:N-with-attributes via `BomLine` |
| `BomLine` (**manual intersect**) | 400k | ParentPart (lookup), ChildPart (lookup), Qty (decimal), EffectiveFrom (date) | models BOM explosion |
| `Contract` | 8k | Counterparty (polymorphic customer lookup), Document (**file**), SignedOn (date only), Value (currency) | N:1 Account/Contact |

**Facts for the rubric:** hierarchy queries (`Under`/`Above` operators for "everything
below this org unit") are **FetchXML/Web API-only — TDS and any exported copy lose
them**, so a copy branch must materialize the tree (recursive CTE in the copy store —
which TDS itself also can't do, no CTEs). BOM explosion over 400k intersect rows is
recursive/analytical → copy territory. File/image columns don't flow through Synapse
Link (metadata only) — documents stay fetched live via Web API regardless of branch.
Sensitive: `Employee.Salary` column-secured. Velocity: low (tens of writes/day).

---

## Column-type coverage matrix

Every Dataverse column type appears in at least one configuration:

| Type | Where |
|---|---|
| Single-line text / multiline text | all / B.Contact.Email-style, C.AlertCase.Note |
| Autonumber | A.Region.Code, B.Order.OrderNumber, C.Device.Serial |
| Whole number / decimal / float | B.OrderLine.Qty / B.Order.Discount, D.BomLine.Qty / B.OrderLine.Weight, C.DeviceReading.Value |
| Currency (+ exchange rate) | B throughout, D.Employee.Salary |
| Date/time: user-local / TZ-independent / date-only | B.Order.OrderDate / C.ReadingTime, B.Invoice.DueDate / A.AppSetting, B.Contact.Birthdate |
| Yes/No | A.Region.IsActive, B.Invoice.Paid |
| Choice / multi-select choice | A.ProductCategory.Tier / .Tags, B, C, D |
| Status / status reason | B.Order.Status |
| Lookup / self-referential / polymorphic / owner | everywhere / D.OrgUnit.Parent, D.Employee.Manager / B.Order.Customer, D.Contract.Counterparty / B.Account.Owner |
| Formula / calculated / rollup | B.OrderLine.LineTotal / — / B.Account.TotalOrderValue |
| File / image | B.Product.Spec, D.Part.Drawing, D.Contract.Document / A icons, D.Employee.Photo |
| JSON (elastic) | C.DeviceReading.Payload |
| Unique identifier | implicit primary key on every table |

Relationship coverage: 1:N (everywhere), N:N native (B.Product↔Account), N:N manual
intersect with attributes (D.BomLine), self-referential hierarchy (D.OrgUnit,
D.Employee), polymorphic (B.Order.Customer, D.Contract.Counterparty).

## Rubric-relevant summary (input to #7)

| Config | Rows (largest table) | Aggregate scope vs 50k cap | Velocity | Staleness tolerance | Sensitive columns | Copy-path complications |
|---|---|---|---|---|---|---|
| A | 800 | far under | ~weekly | days | none | none |
| B | 1.2M | **over** for global KPIs; under for filtered views | hundreds/hr | minutes–hour | CreditLimit | column security must not leak into copy |
| C | 8M/yr | **massively over** | hundreds/min | 15–60 min | none | elastic: no TDS; natural Synapse fit |
| D | 400k | over for BOM explosion; hierarchy ops live-only | tens/day | hours | Salary | files/images don't export; tree must be materialized |

Preview (formal weighting is #7's job): A is branch-indifferent; B and D are
**hybrid-shaped** (filtered/live reads + copied aggregates, files always live);
C is copy-or-nothing for analytics.

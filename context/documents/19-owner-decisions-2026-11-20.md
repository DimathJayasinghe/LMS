# 19. Owner Decisions, 2026-11-20

**Status:** decided by delegation on 2026-11-20. The product owner said "you can decide what's best", so the open owner decisions of [17-roles-permissions-and-flows.md](17-roles-permissions-and-flows.md) section 9 and the owner-decision rows of [18-flow-audit-findings-register.md](18-flow-audit-findings-register.md) were settled with defaults chosen for a Sri Lankan A/L and O/L tuition institute (about 1,200 students, fees mostly in cash at the front desk, many minors, low-end phones, SMS as the reach channel).

**Everything here is reversible.** Every number is a configurable setting (registry in D-MONEY-10), not a constant; every rule is a default the owner can change. This record does not reopen the 2026-11-19 choices (Express + Next, Organization = tenant and Institute = branch, HYBRID enrollment and three payment channels, PHYSICAL-only students lose live and recording access unless HYBRID).

**How to read this file.** Section 1 is the index. Section 2 has the full decisions. Section 3 lists the 28 contradictions found between the proposed decisions and how each was resolved. Section 4 is the delivery sequencing (the master table with tasks is in [the Wave 2 plan](../../docs/superpowers/plans/2026-11-20-wave-2-access-coherence-and-delivery-order.md); Wave 1 is two plans, [1](../../docs/superpowers/plans/2026-11-20-wave-1-working-day-per-role.md) and [1b](../../docs/superpowers/plans/2026-11-20-wave-1b-identity-attendance-structure-and-drivers.md)). Section 5 lists what still needs real values from the owner. Section 6 records two infrastructure and scope calls. Public-repo rule: this file describes security-class findings at defect-class level only; mechanisms live in the private audit directory.

## 1. Index

| Id | Settles | Topic |
|----|---------|-------|
| D-MONEY-1 | F-05, F-65, F-66 | Fee unlock model: which month unlocks what, grace, per-course gate |
| D-MONEY-2 | F-110, F-66, F-63 | One fee function: per-mode, effective-dated, owner-controlled, collected amount fixed |
| D-MONEY-3 | F-63, F-91, F-125, F-98 (sibling link now exists) | Concessions: free card, half card, sibling, scholarship |
| D-MONEY-4 | F-64, F-65, F-66, F-93 | Mid-month joiners, reactivation, drop, mode change (transfer defers to D-STRUCTURE-4) |
| D-MONEY-5 | F-61, F-66 | PayHere chargebacks and reversals |
| D-MONEY-6 | F-66, F-05, F-61 | Bank-slip channel money rules and optional provisional access |
| D-MONEY-7 | F-94, F-66 | Products sold: monthly fee, trial, seminars, one month in advance |
| D-MONEY-8 | F-91, F-79 | Teacher revenue share, who bears concessions and refunds, settlement statements |
| D-MONEY-9 | F-125, F-110, F-63, F-91 | Teacher money authority: caps, approval queue, refunds, fee-change requests |
| D-MONEY-10 | F-66 | Settings registry for every parameter, the monthly job, money build order |
| D-ACCESS-1 | F-18, F-05, F-66 | Shared foundation: one clock and the covered-student helper (settings table is D-MONEY-10) |
| D-ACCESS-2 | F-23, F-17 | Exams and payment |
| D-ACCESS-3 | F-12, F-43 | Entrance scan policy: warn at the door, refuse only on structural problems, time window |
| D-ACCESS-4 | F-07, F-08, F-41, F-100 (reissue endpoint) | Scan identity uniqueness, one resolver, QR value scheme and card reissue |
| D-ACCESS-5 | F-14, F-24, F-35, F-40 | Attendance source of truth: one row, strongest source wins, one writer |
| D-ACCESS-6 | F-14, F-40, F-111, F-54 | Live-class attendance: minimum duration, shared matcher, automatic reconciliation |
| D-ACCESS-7 | F-24 | Recording-watch attendance |
| D-ACCESS-8 | F-04, F-06 | Who may open recordings: students, owning teacher, owner only |
| D-ACCESS-9 | F-05, F-66, F-97, F-101, F-24, F-88 | Recording window, post-enrollment access, missed-class catch-up, lock reason in the list |
| D-EXAMS-1 | F-67, F-74 | Who may enter marks on an exam |
| D-EXAMS-2 | F-13, F-17, F-95 | Hall (in-class, paper) marks entry |
| D-EXAMS-3 | F-17, F-22, F-23 | Sitting a scoped (paper-revision) exam without choosing an audience |
| D-EXAMS-4 | F-71, F-126, F-123 | Publish, unpublish, re-publish and completeness of results |
| D-EXAMS-5 | F-126, F-22 | Late work: per-student extension, late flag, make-up exam, upload grace |
| D-EXAMS-6 | F-73, F-102 | Ranks, class statistics, top scorers and progress for minors |
| D-EXAMS-7 | F-83 | Teacher roster with paid or unpaid state |
| D-EXAMS-8 | F-35, F-83 | Teacher attendance writes and corrections |
| D-EXAMS-9 | F-95 | Assistants and delegates (no new role in v1) |
| D-EXAMS-10 | F-96 | Substitute teachers and co-teachers |
| D-EXAMS-11 | F-67, F-71, F-73, F-83, F-35, F-96, F-126, F-102 | Where the exam-cluster defaults live |
| D-IDENTITY-1 | F-19, F-29, F-30 | Minors, NIC numbers and photos, and the account-setup gate |
| D-IDENTITY-2 | F-98, F-25 (capture) | Guardian record, date of birth, consent, siblings and index-number sign-in |
| D-IDENTITY-3 | F-25, F-122, F-75, F-72, F-76 (recipient and channel rule) | SMS recipients, languages, quiet hours and SMS budget (event catalogue is D-OPS-2) |
| D-IDENTITY-4 | F-27 | Per-user Permission overrides |
| D-IDENTITY-5 | F-31, F-28, F-119 (backend half) | Owner invariants, seed behaviour and step-up confirmation |
| D-IDENTITY-6 | F-32, F-107, F-82, F-15 | Who may change a role or deactivate staff, and the hand-over guard |
| D-IDENTITY-7 | F-21, F-03 | Staff account creation and password reset |
| D-IDENTITY-8 | F-42, F-118, F-30, F-74, F-83, F-124 | Which identity fields each role can see |
| D-IDENTITY-9 | F-99 | Retention, anonymisation and erasure |
| D-IDENTITY-10 | F-100, F-41, F-08, F-15 | Lost card or phone, and verified contact changes |
| D-IDENTITY-11 | F-101, F-82, F-107, F-91, F-97 | Teacher exit and content ownership (composition of other decisions) |
| D-IDENTITY-12 | F-33, F-02, F-03 | Registration hardening and staff-assisted student registration |
| D-IDENTITY-13 | - | Tenant export and restore tool |
| D-STRUCTURE-1 | F-52, F-53, F-109 | Branch model, parallel classes per branch and where a class meets |
| D-STRUCTURE-2 | F-105, F-37, F-116 | Front-desk powers over scheduling and branch context at the scanner |
| D-STRUCTURE-3 | F-92 | Class medium, kind, capacity, waitlist and who may enrol |
| D-STRUCTURE-4 | F-93, F-65, F-10 | Enrollment lifecycle: drop, transfer, rejoin (pause rejected) |
| D-STRUCTURE-5 | F-106, F-109 | What 'deactivating a course' means: one archive rule |
| D-STRUCTURE-6 | F-97, F-93 | Batch end, year rollover, repeaters and recording retention |
| D-STRUCTURE-7 | F-103, F-104 | Simulcast sessions and the default timetable mode |
| D-STRUCTURE-8 | F-50, F-48, F-49, F-96 | Holiday, Poya and tuition-ban calendar and session cancellation |
| D-STRUCTURE-9 | F-107, F-101, F-32, F-79 | Teacher and marker hand-over mechanics and income dating |
| D-STRUCTURE-10 | - | Delivery order summary (authoritative detail: section 4) |
| D-OPS-1 | F-10, F-58, F-77 | Who-owes list, end-of-day cash tally and bulk-upload guard |
| D-OPS-2 | F-72, F-76, F-75 | Notification events, schedulers and defaults |
| D-OPS-3 | F-114, F-37, F-43 | Student-centric entrance scanning |
| D-OPS-4 | F-56 | Zoom licence concurrency |

## 2. Decisions

### D-MONEY-1: Fee unlock model: which month unlocks what, grace, per-course gate

**Settles:** F-05, F-65, F-66, doc 17 §9 item 1, R-PAY-07

**Question:** Which month's payment unlocks live classes, recordings and downloads, is there a grace window, which recordings may a paid student watch, and is the gate per enrollment or per course?

**Decision:** One function, isStudentCovered(student, course, channel, now), built as the plumbing in D-ACCESS-1 and called by every route that needs the paid gate. Uses Organization.timezone (Asia/Colombo), never UTC. Order: (1) Active enrollment in the course (per-COURSE gate: after HYBRID exactly one active enrollment per student and course; until then, a channel is allowed only if some SINGLE active enrollment both permits that channel by delivery mode and is covered; the PHYSICAL-only rule of 2026-11-19 is applied separately and unchanged). (2) Covered if a SUCCESS Payment exists for the current billing month (zero-amount free-card rows count, D-MONEY-3). (3) Else covered if an unexpired AccessException exists for that enrollment and month (front-desk or owner promise-to-pay; or the optional provisional slip window of D-MONEY-6, default OFF). (4) Else covered WITHOUT recordings or downloads if the enrollment is in an unexpired trial (D-MONEY-7). (5) Else covered during GRACE: Colombo day-of-month <= fees.graceDays AND the previous month has a SUCCESS payment (rolling payers only; new joiners and lapsed students get none). (6) Else 402 PAYMENT_REQUIRED naming the month and, when relevant, the day grace ended. A payment covers a billing month (paymentMonth), never a number of days. RECORDINGS: while covered, a student may stream a recording only inside the single window rule of D-ACCESS-9 (session date on or after the first day of the month of Enrollment.createdAt minus recordings.joinerBackfillMonths, and within recordings.viewWindowDays). Recording list and metadata stay visible to every enrolled student; only stream and token issue are gated. Optional stricter owner switch recordings.gateMode = PER_MONTH requires a SUCCESS or concession row for the recording's own month. Front desk and marker never need the gate (and cannot open recordings, D-ACCESS-8). Exams are D-ACCESS-2. EXTENSIONS: SUPER_ADMIN may grant an AccessException of any length with a reason; front desk (ADMIN) up to fees.extensionMaxDaysFrontDesk days, once per enrollment per month, with a reason; teachers cannot (they use D-MONEY-9). Every extension is a row shown in the owner console, never a Payment.

**Rationale:** Cash is paid at the desk, often after salary day, so a hard cliff on the 1st (today UTC, flipping at 05:30 Colombo) locks out students who paid every month. Rolling grace for last month's payers matches 'bring the fee by the 10th' and cannot be farmed by new joiners. One window rule serves revision without letting one payment unlock history. Requiring one enrollment to satisfy both mode and payment stops a paid PHYSICAL enrollment unlocking an unpaid ONLINE one.

**Settings and defaults:** fees.graceDays = 10 (0 disables); fees.graceRequiresPreviousMonthPaid = true; recordings.gateMode = ROLLING (alt PER_MONTH); fees.extensionMaxDaysFrontDesk = 7; fees.extensionMaxPerEnrollmentPerMonth = 1 (front desk; owner unlimited); recordings.joinerBackfillMonths and recordings.viewWindowDays are defined in D-ACCESS-9; billing timezone = Organization.timezone.

**Rejected:** Current-month cliff with no grace; PER_MONTH as default (punishes a student who missed one month); unlimited back catalogue; per-enrollment gate; grace for new joiners; teacher-granted extensions; any-enrollment coverage (cross-mode leak).

**Reversibility:** Fully. Every number is a setting; grace 0 and PER_MONTH restore the strict model; AccessException is additive; the rewrite sits behind one function.

**Code impact:** Verified: access.service.ts assertStudentContentAccess checks only a SUCCESS payment for the UTC getCurrentPaymentMonth (also used at payment.service.ts and payment.controller.ts): replace with the org-timezone helper. Move requirePaid:true callers (live-class.service.ts, video.service.ts with the recording's ClassSession.date, course-module.service.ts) onto isStudentCovered. New tenant-owned model AccessException (organizationId, enrollmentId, month, until, kind GRACE_EXTENSION|PROVISIONAL_SLIP, reason, grantedById nullable) and POST /enrollments/:id/access-exceptions (SUPER_ADMIN, ADMIN with cap). Size M. Vitest matrix: paid/grace/exception/trial x live/recording/download x day 10 vs 11 x Colombo midnight x roles x duplicate enrollments.

### D-MONEY-2: One fee function: per-mode, effective-dated, owner-controlled, collected amount fixed

**Settles:** F-110, F-66, F-63, doc 17 §9 item 11, R-PAY-12

**Question:** Who may change a class fee and from when, do fees differ per mode, and how is the amount owed computed so every path agrees?

**Decision:** (a) New effective-dated CourseFee table (courseId, effectiveFromMonth, monthlyFee, onlineFee nullable, hybridFee nullable, setById, reason). monthlyFee is the PHYSICAL/base fee; a null mode fee falls back to monthlyFee, so behaviour is unchanged until someone prices a mode. Course.monthlyFee stays as a write-through mirror during migration. (b) Only SUPER_ADMIN writes CourseFee. A TEACHER sets the fee only when creating a class (including via rollover, D-STRUCTURE-6) and afterwards only files a FEE_CHANGE request (D-MONEY-9). (c) A change applies from the first month starting at least fees.changeNoticeDays after it is saved, unless nobody has a SUCCESS payment for that course this month and the owner picks 'from this month'. Enrolled families get a FEE_CHANGED SMS (guardian for minors, D-IDENTITY-3). No retroactive change. (d) One pure function computeMonthFee(enrollment, month) = list fee for (course, mode, month) -> minus concession percent (D-MONEY-3) -> joiner proration for the first billable month (D-MONEY-4) -> rounded half-up to fees.roundingRupees. EVERY path calls it: PayHere initiate, front-desk collect, bulk upload, slip creation and approval, outstanding and who-owes. (e) The collected amount is FIXED to the computed fee: ADMIN can no longer type a free-form amount; a different amount is possible only via a concession before collection or a SUPER_ADMIN override with a reason in PaymentAdjustment. Partial and multi-month payments stay out of scope. (f) Mid-month mode change: price follows the new mode from NEXT month; access per D-MONEY-4.

**Rationale:** A class fee is a promise to families and the teacher's income; it must change deliberately and with notice. Null per-mode fees keep today's behaviour and avoid forcing a pricing decision. Fixing the amount closes a gap: today the desk amount is free-form, so caps and concessions could not be enforced.

**Settings and defaults:** fees.changeNoticeDays = 14; fees.roundingRupees = 10 (computed fees only, round half up); fees.collectedAmountMustMatchFee = true; onlineFee = hybridFee = null on every existing course.

**Rejected:** Teacher edits fee immediately; after-the-fact review; one global fee ignoring mode; mandatory per-mode prices at launch; free-form desk amount; computing the fee in SQL (conflicts with the M6 raw-SQL lint ban).

**Reversibility:** Yes. CourseFee is additive and the mirror keeps the old read path; the only one-way step is dropping Course.monthlyFee later, deferred a month.

**Code impact:** payment.service.ts reads Course.monthlyFee at the PayHere upsert, collectEntrancePayment, bulkUploadPayments and the raw-SQL outstanding query: replace all with computeMonthFee in a new fee.service.ts and compute outstanding in TypeScript. Generalise the 'already paid' guard to refuse any SUCCESS row (not only payhereId rows) unless SUPER_ADMIN overrides. class.service.ts updateClass: TEACHER gets 403 FEE_CHANGE_RESTRICTED. New Payment.listAmount nullable (backfill amount). New tenant-owned CourseFee. Size M (4-5 days). Wave 1 who-owes (D-OPS-1) uses the existing fee and swaps to this function.

### D-MONEY-3: Concessions: free card, half card, sibling, scholarship

**Settles:** F-63, doc 17 §9 item 8, F-91, F-125, F-98 (sibling link now exists)

**Question:** How is a free or half card represented so PayHere, cash, slips, the gate, outstanding and statements treat it identically, and who grants one?

**Decision:** A concession is an explicit, dated, reasoned percentage on one enrollment in a new EnrollmentConcession table (enrollmentId, kind FREE_CARD=100 | HALF_CARD=50 | SIBLING | SCHOLARSHIP | OTHER, percent a multiple of concessions.percentStep (25-100), fromMonth, untilMonth required, reason required, bearer (D-MONEY-8), grantedById, approvedById, revokedAt). Percent only. No backdating (fromMonth >= current month); the only exception is a D-MONEY-9 waiver of one unpaid previous month, and a SUPER_ADMIN override with reason. The Payment row stores amount = effective fee, listAmount = list fee, concessionId. A 100% concession is satisfied through the ledger: an idempotent job (and the grant action for the current month) writes a SUCCESS Payment of amount 0, method MANUAL, note FREE_CARD, collectedById = grantor, per active 100% concession and month, so the gate, outstanding, receipts and statements are unchanged. Reports show zero rows as 'free card', excluded from paid counts and collected totals. Half and other partial cards are ordinary payments at the reduced amount through any channel. WHO GRANTS: SUPER_ADMIN within concessions.maxValidityMonths; TEACHER only on own courses only via D-MONEY-9; front desk and marker never; students never. SIBLING is not automatic: concessions.siblingPercent ships at 0; when set, the front-desk enrollment screen only SUGGESTS a SIBLING card for the second and later children sharing a guardianId and the owner approves. Reasons are sensitive (for example orphan, poverty): visible only to SUPER_ADMIN and the requesting teacher, never to front desk or in rosters, and nulled on anonymisation (D-IDENTITY-9). An owner list shows concessions expiring within concessions.expiryWarningDays.

**Rationale:** Free and half cards are routine and decided verbally today, recorded as a typed amount with no reason or owner. An explicit row gives accountability without changing how cash is collected; zero-amount ledger rows avoid a second rule inside the most security-sensitive function.

**Settings and defaults:** concessions.percentStep = 25; concessions.defaultValidityMonths = 6; concessions.maxValidityMonths = 12 (owner; the teacher-granted limit is teacherMoney.maxMonths, D-MONEY-9); concessions.backdateMonths = 0; concessions.siblingPercent = 0; concessions.expiryWarningDays = 30.

**Rejected:** Per-enrollment feeOverride amount; gate exception for 100% concessions; free-form desk amount; automatic sibling detection granting discounts; uncapped teacher grants; retroactive grants.

**Reversibility:** Yes. Revoking stops future rows; existing zero rows are ledger rows corrected by override; the table is additive.

**Code impact:** New tenant-owned EnrollmentConcession; Payment.concessionId nullable; concession.service.ts with actor-vs-target and assertCourseAccess; BullMQ job fee-month-roll (D-MONEY-10) upserting zero rows on the existing @@unique([enrollmentId, paymentMonth]); verify Payment.amount has no CHECK > 0; outstanding and financial report treat 0 correctly; reuse the any-SUCCESS guard. Routes /api/enrollments/:id/concessions (SUPER_ADMIN; teacher via D-MONEY-9). Size M (4 days). Tests: grant/revoke/expire, step validation, no backdating, job idempotency and missed-run recovery, PayHere amount equals discounted amount, gate passes on a free month, teacher outside own course 403, front desk 403, reason hidden from ADMIN.

### D-MONEY-4: Mid-month joiners, reactivation, drop, mode change (transfer defers to D-STRUCTURE-4)

**Settles:** F-64, F-65, F-66, doc 17 §9 item 8, F-93

**Question:** What does a student pay in the month they join, rejoin, drop, or switch class mode?

**Decision:** FIRST BILLABLE MONTH: enrolled on or before day fees.joinerFullFeeUntilDay (15) of the month pays the full fee; after that day pays fees.joinerLateFeePercent (50) percent for that first month (rounded), second month onward full. Recorded as the Payment amount with listAmount = full fee and note JOINER_PRORATED; a pricing rule, not a concession, so the teacher's share is computed on the amount collected (SHARED, D-MONEY-8). BILLING CLOCK: Enrollment.activatedAt set at creation and every reactivation (backfilled to createdAt); billable months and arrears start at the month of activatedAt; a trial's clock starts when the trial ends. REACTIVATION: if the current month already has SUCCESS, reactivation costs nothing; after a gap of one or more full months it is a new activation and the joiner rule applies again. Unpaid months of a closed period are not carried over; the outstanding report shows up to fees.arrearsReportMonths previous unpaid months within active periods; arrears never lock content beyond grace. DROP is immediate on staff confirmation (D-STRUCTURE-4), no automatic refund. COURSE-TO-COURSE TRANSFER is staff-only under D-STRUCTURE-4 (a transfer-in is not a joiner, no proration). SAME-COURSE MODE CHANGE: in-place classType update; existing Payment rows stay valid. A change that ADDS online access takes effect on the 1st of next month by default (Enrollment.nextClassType applied by the monthly job); it may take effect immediately only if the current-month fee for the new mode is not higher than what was paid, or SUPER_ADMIN records the difference as an override with a reason. A change that REMOVES online access takes effect immediately, no refund. Price follows the new mode from next month. INTERIM until HYBRID ships: block a second active enrollment of the same course in another mode (409 ALREADY_ENROLLED_OTHER_MODE).

**Rationale:** Weekly classes mean a student joining after the 15th misses about half the month; half fee is the figure teachers and parents already use and is easy to state at the desk. Delaying upgrades stops a PHYSICAL student paying the physical fee, switching to HYBRID mid-month and watching a month of recordings.

**Settings and defaults:** fees.joinerFullFeeUntilDay = 15 (31 disables); fees.joinerLateFeePercent = 50; fees.arrearsReportMonths = 3; fees.modeUpgradeEffective = NEXT_MONTH (alt IMMEDIATE_IF_NOT_HIGHER); fees.roundingRupees = 10.

**Rejected:** Per-session proration; always full fee; free until next month; refund-on-drop by default; immediate upgrade with top-up charge (Phase G); a separate cross-course transfer rule here (single owner is D-STRUCTURE-4).

**Reversibility:** Yes. Proration is a setting; activatedAt and nextClassType are additive nullable columns.

**Code impact:** Verified: Enrollment has only createdAt; reactivation flips isActive (enrollment.service.ts). Add activatedAt and nextClassType (part of the single enrollment migration, D-STRUCTURE-10). computeMonthFee applies the rule; changeEnrollmentMode service; fee-month-roll applies nextClassType. Size M (3 days). Tests: join day 15 vs 16, month end, reactivation in paid month vs after gap, upgrade next-month vs immediate-if-not-higher, downgrade immediate, duplicate-mode block, Colombo midnight.

**Wave 1 implementation (#114, unreleased):** only the interim of F-65 is built: a second active enrollment of one course in the other mode is refused with `409 ALREADY_ENROLLED_OTHER_MODE`, under a per-student-and-course advisory lock so two desks cannot both succeed. Mode change, `activatedAt`, `nextClassType` and the switch endpoint stay in Wave 2a with HYBRID.

### D-MONEY-5: PayHere chargebacks and reversals

**Settles:** F-61, doc 17 §9 item 8, F-66

**Question:** What happens to the payment, access and the teacher's income when PayHere reports a chargeback after success?

**Decision:** A chargeback (status_code -3) on a SUCCESS row is a REVERSAL in one Serializable transaction: add PaymentAdjustmentType.REVERSAL; write an immutable adjustment (amount = payment.amount minus refundedAmount, reason 'PayHere chargeback', externalReference = PayHere payment id, unique per type so a repeated -3 is a no-op); set Payment.status to FAILED (not REFUNDED, which would block re-payment) and clear Payment.payhereId (the id lives on in the adjustment). Access for that month is lost at once, no grace. Student, owner and front desk are notified and the owner console lists open reversals. The month stays payable by desk, slip or PayHere. No automatic student block; the owner sees history and decides. Dispute fees are institute costs, never charged to a teacher. In the teacher statement a reversal is a negative line, bearer SHARED unless the owner marks 'institute error'. The webhook stays signature-verified and idempotent (lookup also checks adjustment externalReference); -3 on a non-SUCCESS row keeps today's behaviour. A duplicate PayHere success on a month already SUCCESS by another channel follows spec section 3.3 rule 5. The same REVERSAL path, SUPER_ADMIN only, covers a slip later found fake or returned (D-MONEY-6).

**Rationale:** A chargeback must reverse the payment and revoke access. Append a ledger row, flip to a payable state, tell the owner. FAILED avoids a new status; REFUNDED would make the month permanently unpayable.

**Settings and defaults:** payments.chargebackLocksAccessImmediately = true; payments.chargebackNotifyOwner = true; payments.reversalDefaultBearer = SHARED.

**Rejected:** Keep ignoring; REFUNDED; new PaymentStatus; auto-block student; grace after chargeback.

**Reversibility:** Yes. Append-only adjustment; a mistaken reversal is corrected by an owner OVERRIDE with reason.

**Code impact:** The payment notify handler does not process chargebacks today. Add REVERSAL (ALTER TYPE ADD VALUE in its own non-transactional migration), PaymentAdjustment.bearer (SHARED|INSTITUTE), notification type, handler mirroring refundPayment. Size S (1-2 days). Tests: -3 flips to FAILED with exactly one adjustment, repeat idempotent, access denied next request, month payable at desk, partial-refund row, bad signature rejected, -3 on PENDING or FAILED unchanged.

### D-MONEY-6: Bank-slip channel money rules and optional provisional access

**Settles:** F-66, F-05, F-61

**Question:** What may a slip claim, how fast must staff approve, does a pending slip unlock anything, and what if a slip is later fake?

**Decision:** A slip pays exactly ONE billing month of ONE enrollment at exactly computeMonthFee (concession-aware). claimedAmount must equal it; short, over or multi-month transfers are rejected with a reason and resubmitted. Allowed months: current and, within fees.advanceMonthsAllowed, the next. A month already SUCCESS by any channel is 409 ALREADY_PAID. Evidence: transferDate required, not in the future, within slips.maxTransferAgeDays; referenceNo required; JPEG, PNG or PDF up to slips.maxSizeMb; one open slip per enrollment-month; after slips.maxRejectionsPerMonth rejections the student pays at the desk. Duplicate referenceNo within the organization is blocked at approval. Approvers: ADMIN and SUPER_ADMIN only; teachers and markers see nothing. Staff target slips.approvalSlaHours. Slip images are viewable only by staff approvers through short-lived presigned GETs with an audit row, never sent by SMS. PROVISIONAL ACCESS: slips.provisionalAccessHours ships at 0, i.e. the decided strict rule 'a pending slip does not unlock content' stands. If an owner enables it, a SUBMITTED slip grants one system AccessException for that enrollment-month (live and streaming only, never downloads, only for enrollments that paid the previous month, once per month, ended at once on rejection); approval is the only thing that creates SUCCESS. Bank details (name, branch, account name, number) are organization settings, never env or constants, and never written into the public repo. REVERSAL of a slip found fake or returned: SUPER_ADMIN only via REVERSAL (D-MONEY-5). Weekly bank reconciliation is an owner task supported by the cash/slip report by collector and day.

**Rationale:** Exact-fee single-month slips keep the ledger simple and avoid a wallet. The strict default respects the decided staff-approved channel; grace already protects honest late depositors who paid last month.

**Settings and defaults:** slips.provisionalAccessHours = 0 (opt-in, suggested 48); slips.maxTransferAgeDays = 45; slips.maxSizeMb = 8; slips.approvalSlaHours = 24; slips.maxRejectionsPerMonth = 3; slips.requireReference = true; slips.allowedTypes = jpeg,png,pdf; bankName, bankBranch, bankAccountName, bankAccountNumber unset until the channel is enabled.

**Rejected:** Provisional access on by default; unlimited pending unlock; partial or multi-month transfers; approver may change the amount; teacher approves own class slips.

**Reversibility:** Yes. Settings; PaymentSlip not built yet so nothing migrates.

**Code impact:** Design applied before first slip code: extend the spec's slip service with the checks above; approval uses computeMonthFee and the any-SUCCESS guard; initiatePayherePayment and the PayHere success update set method ONLINE (spec rule 6); bank details read from OrganizationSetting. Size M (3 days). Tests: amount mismatch, month already paid, racing slips, optional window granted once and revoked on reject, reversal after approval, duplicate reference, stale date, oversize file.

### D-MONEY-7: Products sold: monthly fee, trial, seminars, one month in advance

**Settles:** F-94, R-NTH-06, F-66

**Question:** Beyond the monthly fee, what does the system sell, how do trials work, may families pay ahead?

**Decision:** The LMS sells one thing: the monthly fee for one course in one billing month, plus three additions. (1) FREE TRIAL: a first-time student of that course may be granted a trial of trials.days days by ADMIN, SUPER_ADMIN or the owning TEACHER (assertCourseAccess), once per student per course ever (Enrollment.trialUntil, cannot be set twice). A trial has an explicit mode, PHYSICAL or ONLINE (never HYBRID): PHYSICAL allows the entrance scan and sessions only; ONLINE allows live only. Recordings and downloads are excluded (trials.allowRecordings = false); exams follow D-ACCESS-2. A PHYSICAL trial counts toward class capacity while it lasts. A trial creates no Payment row, is excluded from outstanding and teacher share, and the billing clock starts when it ends; afterwards the normal gate applies. (2) ADVANCE PAYMENT: up to fees.advanceMonthsAllowed (1) month ahead, replacing the blanket FUTURE_MONTH refusal. (3) Seminars, revision and seasonal classes are ordinary Courses with their own fee, archived when finished. NOT SOLD: per-session drop-in (door money stays outside the LMS), fixed-term bundles, multi-month discounts, referral credits.

**Rationale:** A free first visit, a revision seminar priced as a one-month course and paying early at month end cover nearly everything an institute does. Trials without recordings do not hand over the product.

**Settings and defaults:** trials.days = 14 (about two weekly sessions); trials.maxPerStudentPerCourse = 1; trials.allowRecordings = false; trials.grantRoles = ADMIN, SUPER_ADMIN, owning TEACHER; fees.advanceMonthsAllowed = 1.

**Rejected:** Per-session billing; bundles; trial with recordings; unlimited trials; capped teacher trials; referral credits.

**Reversibility:** Yes. Two nullable columns and a gate branch; trials.days = 0 disables; advance 0 restores today.

**Code impact:** Enrollment.trialUntil (in the single enrollment migration); createTrialEnrollment service; trial branch in the coverage function (TRIAL_NO_RECORDINGS); exclude trials from outstanding; change the FUTURE_MONTH check at payment.service.ts and mirror in initiate and slips. Size S-M (2 days). Tests: second trial refused, expiry, recording denied, live allowed, PHYSICAL trial gets no online content, capacity counted, advance allowed and second month refused, other teacher's course refused.

### D-MONEY-8: Teacher revenue share, who bears concessions and refunds, settlement statements

**Settles:** F-91, R-PAY-10, F-79

**Question:** How is each teacher's income computed, who absorbs concessions, refunds and chargebacks, and how does the owner close the month?

**Decision:** The system computes and records; it never moves money. The owner pays teachers outside the system. SHARE: CourseTeacherShare (courseId, teacherId, percent, effectiveFromMonth; several rows summing to at most 100 allow co-teachers later) is also the dated record of who owns a course's income (this replaces any separate CourseTeacherPeriod; a hand-over adds a row for the new teacher effective per handover.defaultEffectiveMonth). NO silent default and no suggested number: statements.suggestedSharePercent is unset (null); a statement cannot finalise while any course in it lacks a share row; only SUPER_ADMIN edits, never retroactive into a FINAL statement. WHO BEARS WHAT: (a) owner-granted concession defaults to INSTITUTE (share computed on LIST fee, teacher unchanged), owner may choose SHARED; (b) teacher-granted concession is SHARED (share on amount collected); (c) joiner proration SHARED; (d) refunds and reversals SHARED (negative line) unless the owner marks 'institute error' (INSTITUTE); (e) dispute fees and bank charges are institute costs. A teacher is never reduced by a decision they did not take. STATEMENT per teacher per month, snapshotted on finalise (TeacherStatement, TeacherStatementLine) with collected, free-card and concession cost by bearer, refunds and reversals, share percent, share amount, payouts and closing balance. BASIS WITHOUT A PAID DATE: a statement includes every SUCCESS payment with paymentMonth <= statement month and every adjustment not yet in a FINAL statement (unique sourceKey P:<paymentId> or A:<adjustmentId>); a late or advance payment appears as a labelled line in the next open statement; a FINAL statement never changes; the opening statement starts at the go-live month. Teachers see only FINAL statements with a per-student drill-down of own course (name and amount; no phone, NIC or concession reason). Owner closes by statements.closeDay (console reminder). Optional TeacherPayout rows (amount, date, reference) carry the balance forward. Cash physically held by a teacher (none under D-EXAMS-9) would be a negative line.

**Rationale:** The teacher owns class income and the institute keeps a percentage; disputes arise over discounts and refunds. 'The person who decides bears the cost' is easy to explain. Keying on rows not yet in a final statement avoids needing a reliable paid date. Leaving the percentage blank forces the owner to enter a real number instead of clicking through a guess.

**Settings and defaults:** statements.suggestedSharePercent = null (unset); statements.concessionBearerOwnerGranted = INSTITUTE; statements.concessionBearerTeacherGranted = SHARED; statements.refundBearerDefault = SHARED; statements.closeDay = 5; statements.visibleToTeacher = FINAL_ONLY; statements.payoutRecordingEnabled = true.

**Rejected:** Silent global default percent; concession always on teacher or always on institute; paidAt backfill; restating closed statements; automatic payouts.

**Reversibility:** Yes. Additive advisory tables; bearer rules are settings for new statements.

**Code impact:** New tenant-owned CourseTeacherShare, TeacherStatement, TeacherStatementLine, TeacherPayout; PaymentAdjustment.bearer; EnrollmentConcession.bearer; teacher-settlement.service.ts (draft, finalise Serializable, CSV); owner and teacher endpoints. Size M-L (5-6 days). Tests: bearer matrix, late payment appears once, FINAL immutable, no finalise with missing share, co-teacher sum, teacher cannot read others or drafts, drill-down hides phone, NIC and reasons.

### D-MONEY-9: Teacher money authority: caps, approval queue, refunds, fee-change requests

**Settles:** F-125, F-110, F-63, F-91, doc 17 §9 item 14

**Question:** What may a teacher do with money on their own class, what is automatic, what is capped, how are refunds executed?

**Decision:** A single PaymentRequest table is the only door through which a teacher touches money, scoped by assertCourseAccess. Types: CONCESSION, WAIVER (forgive an unpaid current or one previous month, implemented as a one-month 100% concession; a previous-month waiver is never auto-approved), REFUND, CORRECTION, FEE_CHANGE. Each has a reason of at least requests.minReasonLength, a target, an Idempotency-Key and an audit row. AUTO-APPROVAL only for CONCESSION and current-month WAIVER, within a standing cap: sum of monthly discount values (list fee x percent) of the teacher's active teacher-granted concessions plus waivers <= teacherMoney.capAmount, and card count <= teacherMoney.capCount; teacher-granted concessions last at most teacherMoney.maxMonths and are renewed by a new request. Above the cap the request waits for the owner. REFUNDS ARE NEVER AUTO-APPROVED OR AUTO-EXECUTED (resolving the 'executed by the system' vs 'owner-only' contradiction in F-125 and doc 17 section 12 in favour of owner-only): the teacher files, the owner approves and executes through the existing POST /payments/:id/refunds (never above paid, Idempotency-Key, ledgered). CORRECTION and FEE_CHANGE execute only by the owner. A teacher never approves their own request above the cap, never acts on another teacher's course, never sees slips or others' money; front desk gains nothing; no request touches a SUPER_ADMIN or peer ADMIN. Teacher-granted concessions are bearer SHARED. Requests expire after requests.expiryDays. Shipping caps are ZERO, so everything queues for the owner until raised per teacher on one screen (TeacherMoneyLimit); suggested starting values when raising: Rs 5,000 per month and 3 cards.

**Rationale:** The teacher is accountable for the class, but uncapped authority is a money leak and routing everything through the owner stalls both. A standing monthly exposure cap is easy to explain and cannot be gamed by many small grants. Refunds are where an error costs most, so they stay with the owner.

**Settings and defaults:** teacherMoney.capAmount = 0 (suggested start 5000); teacherMoney.capCount = 0 (suggested 3); teacherMoney.maxMonths = 3; teacherMoney.waiverMaxMonthsBack = 1; requests.minReasonLength = 10; requests.expiryDays = 14; refund auto-approval is fixed false (not configurable); per-teacher overrides in TeacherMoneyLimit.

**Rejected:** Uncapped; owner approves everything; per-grant cap; auto-approved refunds; front-desk approval authority; non-zero shipping caps.

**Reversibility:** Yes. Caps are settings; lowering a cap blocks new auto-approvals without revoking cards; table additive.

**Code impact:** New tenant-owned PaymentRequest and TeacherMoneyLimit; payment-request.service.ts with cap evaluation in a Serializable transaction (concurrent grants cannot both fit), actor-vs-target and assertCourseAccess on reads too, Idempotency-Key, audit, notifications; owner queue endpoint feeding the F-127 console; executors reuse concession.service, refundPayment, overridePayment, CourseFee write. Size M-L (5 days). Tests: cap boundary (at cap, one rupee over), concurrent grants, expiry, other teacher 403, self-approval refused, refund request changes nothing until the owner executes, front desk and marker 403, SUPER_ADMIN or peer-admin target refused.

### D-MONEY-10: Settings registry for every parameter, the monthly job, money build order

**Settles:** F-66

**Question:** Where do configurable defaults live, who edits them, what runs monthly, and in what order is the money work built?

**Decision:** The single settings home for the whole product: a new OrganizationSetting table (organizationId, key, value Json, updatedById, updatedAt; unique on organizationId plus key) read through a typed registry in code (Zod type, default, allowed range per key). Key convention domain.leafName; domains: console, fees, concessions, trials, slips, teacherMoney, requests, statements, access, attendance, recordings, exams, roster, sessions, identity, sms, retention, enrollment, batch, calendar, handover, capacity, timetable, zoom, tally, notifications, payments, bulk, progress, dsar, tenantExport, tenantOffboard, delegates, staff. Money leaf names used in the money decisions map to: fees.* (graceDays, graceRequiresPreviousMonthPaid, extensionMaxDaysFrontDesk, extensionMaxPerEnrollmentPerMonth, changeNoticeDays, roundingRupees, collectedAmountMustMatchFee, joinerFullFeeUntilDay, joinerLateFeePercent, arrearsReportMonths, modeUpgradeEffective, advanceMonthsAllowed, reminder settings of D-OPS-1), concessions.*, trials.*, slips.*, teacherMoney.*, requests.*, statements.*, payments.* (chargeback keys). Unknown keys are rejected; a missing row means the registry default. Only SUPER_ADMIN edits; every change writes an audit row; a change applies to future decisions only, and anything affecting a price is snapshotted on the Payment. Settings are read from the database per request with a request-scoped memo only: NO process-memory cache and NO Redis cache (stateless invariant; no hand-built Redis keys before M5). Never configurable: refund auto-approval, and that PHYSICAL-only students get no online content. One idempotent BullMQ repeatable job fee-month-roll (daily 00:10 Asia/Colombo, heavy work days 1-3) writes zero-amount rows for active 100% concessions, applies Enrollment.nextClassType, mirrors a newly effective CourseFee into Course.monthlyFee, expires concessions and trials, and queues the concession-expiry warning. MONEY BUILD ORDER inside the global sequence: settings and org-time helper; fee.service computeMonthFee, CourseFee, any-SUCCESS guard, fixed amount; REVERSAL handler; coverage function and AccessException; activatedAt, proration, mode change; concessions and the monthly job; trials and advance month; slip rules inside the slip build; PaymentRequest and caps; shares and statements. Every new table follows the tenant rule (organizationId, relation, @@index([organizationId]); registry test) with no global unique on a user-visible value.

**Rationale:** Every number is an owner business choice that differs between institutes and the product is becoming multi-tenant; data not code, with documented defaults so a new organization works on day one. Reading from the database keeps the API stateless.

**Settings and defaults:** Registry defaults are those listed in each decision. Settings keys that require owner input before enabling: bank details (slips), course shares (statements), caps (teacherMoney).

**Rejected:** Constants; env vars; generic untyped key-value; in-process or Redis cache.

**Reversibility:** Yes. Settings are data; registry can add or retire keys; the job is idempotent and can be paused (coverage falls back to grant-time rows).

**Code impact:** New OrganizationSetting model, settings.service.ts plus Zod registry module, org-timezone helpers replacing getCurrentPaymentMonth, a withAdvisoryLock(namespace, organizationId, key) helper so every advisory lock in the set uses one hashing convention, BullMQ job in the existing worker, SUPER_ADMIN grouped settings screen. Size M (3 days). Tests: unknown key rejected, range validation, default fallback, audit row, job idempotency across two runs, request memo does not leak.

### D-ACCESS-1: Shared foundation: one clock and the covered-student helper (settings table is D-MONEY-10)

**Settles:** F-18, F-05, F-66

**Question:** Where do parameters live and what single helper computes the month and 'is this student covered'?

**Decision:** Parameters live ONLY in the OrganizationSetting registry defined in D-MONEY-10; this decision registers its keys there and creates no second store. Two nullable per-course override columns exist: Course.examsRequirePaid and Course.recordingWindowDays (null = inherit). All billing-month and 'today' arithmetic goes through one helper using Organization.timezone (Asia/Colombo), replacing the UTC getCurrentPaymentMonth in backend and frontend. isStudentCovered is the one helper for 'is the student paid'; its rules are exactly D-MONEY-1 and its grace key is fees.graceDays. In Wave 1 the helper ships with the simple rule (current org-timezone month SUCCESS, else fees.graceDays when the previous month is SUCCESS) so the scanner, exams and the existing gate benefit at once; D-MONEY-1 later extends the same function with exceptions, trial and mode, without touching callers. The owner edits all keys on one 'Access rules' screen (SUPER_ADMIN, audited).

**Rationale:** Hard month-start cliffs swamp the front desk; the owner must tune grace; four code paths currently re-derive 'paid' differently; UTC is wrong for 5.5 hours around every month boundary.

**Settings and defaults:** fees.graceDays = 10 (range 0-31; 0 restores the hard month rule), shared with D-MONEY-1. OrganizationSetting itself: see D-MONEY-10.

**Rejected:** Env vars or constants; Json blob on Organization; per-feature settings tables; keeping UTC; a second helper beside D-MONEY-1's function.

**Reversibility:** Fully. Additive; grace 0 restores today.

**Code impact:** org-time.ts and isStudentCovered in access.service.ts; replace getCurrentPaymentMonth call sites in access.service.ts, payment.service.ts and the frontend; small Access rules page. Vitest: 23:59 and 00:01 Colombo on the 1st, grace day N and N+1, missing row defaults. Size M, shared with D-MONEY-10.

### D-ACCESS-2: Exams and payment

**Settles:** F-23, doc 17 §9 item 2, F-17

**Question:** Should a student whose monthly fee is unpaid be able to sit the monthly test?

**Decision:** Default yes. Sitting an exam needs an active enrollment (and, for scoped exams, the frozen participant row); results and marks are NEVER payment-gated. Owner setting exams.requirePaidToStart (default false) with nullable Course.examsRequirePaid override turns on 'must be covered to START an online exam' for one course or all. When on: checked once at start only (never mid-exam or at submit), using the exam's own start month in the org timezone and isStudentCovered (so grace counts). Online exams only; hall papers are outside the LMS gate and the teacher sees the roster state (D-EXAMS-7). Failure is 402 PAYMENT_REQUIRED naming the month.

**Rationale:** Symmetry with the door (D-ACCESS-3 only warns); locking a child out of a paper for the parent's timing is unfair, yet some teachers insist, so the lever exists per course, off by default.

**Settings and defaults:** exams.requirePaidToStart = false; Course.examsRequirePaid nullable; reuses fees.graceDays. Fixed: results never gated.

**Rejected:** Always require payment; no gate at all; gate results; check at submit or mid-exam.

**Reversibility:** Fully; no migration beyond a nullable column.

**Code impact:** One branch in assertStudentExamStartAccess (access.service.ts); Course column; settings toggle and teacher tri-state. Vitest: flag x paid/unpaid/grace x scoped/legacy x override x results always readable. Size S.

### D-ACCESS-3: Entrance scan policy: warn at the door, refuse only on structural problems, time window

**Settles:** F-12, F-43, doc 17 §9 item 6

**Question:** Should the scan refuse or only warn for unpaid, not-enrolled and wrong-mode students, and inside what time window may a session be scanned?

**Decision:** Warn, record, never block the door for three business conditions: not enrolled in this course, mode does not include physical (ONLINE-only), fee not covered. The scan still writes the attendance row and returns {enrollmentState ENROLLED|NOT_ENROLLED|MODE_MISMATCH, paidThisMonth, graceUntil, late, warnings[], student{name, indexNumber, profileImage, class}}; StaffScanner shows amber (inside grace) or red (outside grace) with a Collect payment link, and 'Not enrolled' with an Enroll link. Refuse (nothing written) only for structural failures: unknown or ambiguous code, deactivated or non-student user, institute mismatch, or a session outside its scan window. Warning state is SNAPSHOTTED on the row (enrollmentStateAtScan, paidAtScan) so 'attended without enrollment or payment' stays computable. Session resolution follows D-OPS-3 (student-centric auto mode, manual session pick as fallback). Scan window: opens attendance.scan.opensBeforeStartMinutes before start, LATE after attendance.scan.lateAfterStartMinutes, closes attendance.scan.closesAfterEndMinutes after end. Outside the window only SUPER_ADMIN may override with a mandatory reason; a forgotten scan is otherwise fixed by manual mark (D-ACCESS-5). Each business condition can be tightened to BLOCK by one setting.

**Rationale:** At a tuition door a queue of teenagers meets one clerk; refusing a child for an unpaid fee causes a scene while the money is collected at the same desk. Not-enrolled is usually a delayed entry or a trial visitor; flagging loses nothing. A 30-minute after-end window limits retroactive scans.

**Settings and defaults:** attendance.scan.unpaidPolicy = WARN; attendance.scan.notEnrolledPolicy = WARN; mode mismatch always WARN; attendance.scan.opensBeforeStartMinutes = 60; attendance.scan.lateAfterStartMinutes = 15; attendance.scan.closesAfterEndMinutes = 30; fees.graceDays shared.

**Rejected:** Refuse unpaid at the door; refuse not-enrolled; no snapshot; +120 minute window; no window.

**Reversibility:** Fully by settings; snapshot columns additive nullable.

**Wave 1 implementation (#115, unreleased):** the warning half is built: `scan-context.service.ts` derives the enrollment state (active PHYSICAL enrollment = ENROLLED, ONLINE only = MODE_MISMATCH, none = NOT_ENROLLED), the fee state through `isStudentCovered` on that enrollment, and the two policies; the scan returns `context` and snapshots `enrollmentStateAtScan`, `paidAtScan` and `instituteId` on the first scan only; manual mark records the same snapshot and never refuses. The scan window, `late`, student-centric auto mode and `recordAttendance` are Wave 1b. The single Attendance migration (status, mark/void columns, durationSeconds, instituteId, `VIDEO`) ships with it.

**Code impact:** scanBarcode loads session start and duration, evaluates the window, resolves the enrollment, derives MODE_MISMATCH, calls isStudentCovered, writes via recordAttendance (D-ACCESS-5) and returns the context object. Attendance columns come from the single Attendance migration. Frontend banner, large photo, links, SCAN_WINDOW_CLOSED copy; new report for SUPER_ADMIN and the course's teacher. Vitest condition x policy, window edges, override with and without reason, inactive user, institute mismatch. Size M.

### D-ACCESS-4: Scan identity uniqueness, one resolver, QR value scheme and card reissue

**Settles:** F-07, F-08, F-41, F-100 (reissue endpoint), doc 17 §9 item 11 and 12

**Question:** Must a scan code identify exactly one student across both code kinds, and should the QR value stay index-based or become random?

**Decision:** One code, one student, unique across all code kinds within the organization, enforced at write time in the service under a Postgres advisory lock (withAdvisoryLock) in one transaction; existing columns and constraints are kept (no new global unique before M3, which swaps to (organizationId, code)). An existing-data report (never committed) is run before enforcement; use the production-image runbook in the maintenance guide. One resolver, resolveStudentByCode, is used by the attendance scan AND payment collection: it gathers every student a code could mean; exactly one resolves, zero is 404, more than one is AMBIGUOUS_CODE and the scanner falls back to prominent index-number or name search; it never picks a winner. Rejections reveal nothing about other holders. QR VALUE: all NEW and reissued LMS codes are random 10-character Crockford base32 (50 bits, CSPRNG), no prefix; the index number stays printed under the QR. Existing sequential-format codes keep working while attendance.code.acceptLegacyFormat = true and are replaced lazily on reissue, not by a forced reprint of 1,200 cards; the owner should switch legacy off once cards are reissued (target: end of the next academic year). The primary integrity control is human: the scan response returns the student's profile photo (never an NIC image) shown large; no photo shows 'No photo on file'. A single front-desk Reissue card endpoint (reason codes and lost-phone token revocation in D-IDENTITY-10, audit row, old code moved to RetiredBarcode and invalid at once) and an idempotent 'Generate missing codes' action with a printable A6 sheet. Rotating in-app QR rejected for now.

**Rationale:** At a staffed gate a face on the screen is the cheapest defence against a lent code and matters for minors; lazy rotation avoids a costly forced reprint. Rotating QR needs working data on weak phones.

**Settings and defaults:** attendance.code.acceptLegacyFormat = true; attendance.code.length = 10 (8-16); AMBIGUOUS_CODE not configurable.

**Rejected:** Photo-less scan acceptance; rotating signed QR; forced mass reissue; merging both code tables now; institute-first-then-global precedence.

**Reversibility:** Resolver and rule are code; random codes additive (legacy accepted); reissue per student; only the optional reprint is irreversible.

**Code impact:** scan-code.service.ts resolveStudentByCode (user.service.ts resolveStudentByBarcode stays as a thin wrapper for the desk route until the Wave 1 rename); attendance.scanBarcode and payment collect-by-barcode use it; every code writer calls the uniqueness check; auth.service formatLmsBarcode gets the random generator; reissue and generate-missing endpoints; scanner photo and ambiguous fallback; collision report script. Wave 0 slice: resolver, collision report and uniqueness for new writes; random scheme and reissue follow in Wave 1. Size M. Vitest: resolver matrix, uniqueness with simulated concurrent write, reissue invalidates the old code.

### D-ACCESS-5: Attendance source of truth: one row, strongest source wins, one writer

**Settles:** F-14, F-24, F-35, F-40, doc 17 §9 item 7

**Question:** When presence can come from a staff mark, an entrance scan, a live Zoom join or a recording watch, which is the authority and what if two disagree?

**Decision:** Exactly one Attendance row per student per session (existing unique). Source follows strict precedence for automatic writers: entrance scan (QR/BARCODE) beats live join (ZOOM_WEBHOOK, labelled Live) beats recording watch (new VIDEO); a lower writer never replaces a higher one and only refreshes lastSeenAt. Staff authority overrides all: a row touched by staff carries markedById and is locked against automatic writers; a staff edit changes status and markedById but never the original source (audit holds history). Attendance.status = PRESENT, LATE, PARTIAL, EXCUSED. PRESENT and LATE count as attended; PARTIAL (live join below the minimum, D-ACCESS-6) and EXCUSED count as neither attended nor unexplained absence until staff act. Who marks: owning TEACHER and SUPER_ADMIN may mark or change any status (assertCourseAccess); a session substitute for that session only (D-EXAMS-10); front desk (ADMIN) only PRESENT or LATE, within attendance.frontDeskWindowHours after the scan window closes, to fix a forgotten scan, and cannot excuse unless attendance.excuse.frontDeskMay is true. Teacher PRESENT/LATE marks and voids are allowed within attendance.correctionWindowHours of the session start, EXCUSED within attendance.excuseWindowDays, owner unrestricted (void mechanics in D-EXAMS-8). Recording watch counts as present only for ONLINE enrollments (D-ACCESS-7). All writers (scan, manual, live reconcile, recording) use one recordAttendance helper applying precedence, snapshots and the audit row.

**Rationale:** The teacher knows who was really there and absence SMS and pay disputes hang on this record, so a human decision beats any machine signal, and a scan (a person looked at a face) outranks a join. Keeping the original source preserves evidence.

**Settings and defaults:** attendance.frontDeskWindowHours = 24; attendance.correctionWindowHours = 72; attendance.excuseWindowDays = 14; attendance.excuse.frontDeskMay = false. Precedence fixed in code.

**Rejected:** Latest write wins; per-source rows; equal sources; front desk edits any record any time.

**Reversibility:** Mostly. Additive columns; precedence is code; old rows keep their source (mislabelled recording rows left as is).

**Code impact:** ONE Attendance migration shared with D-ACCESS-3, D-ACCESS-6, D-ACCESS-7, D-EXAMS-8 and D-STRUCTURE-2: enum AttendanceStatus, AttendanceSource += VIDEO, columns status (default PRESENT), markedById, voidedAt, voidedById, voidReason, enrollmentStateAtScan, paidAtScan, durationSeconds, instituteId. recordAttendance helper used by scanBarcode, markManualAttendance, reconcileZoomAttendance, markVideoAttendance; teacher route added. Frontend source labels Entrance, Live, Recording, Teacher. Vitest: precedence across sources x existing source x locked, staff edit preserves source, front-desk window edges, ADMIN excuse denied. Size M.

### D-ACCESS-6: Live-class attendance: minimum duration, shared matcher, automatic reconciliation

**Settles:** F-14, F-40, F-111, F-54

**Question:** What counts as present for a live Zoom class, how are joins attributed, who runs reconciliation?

**Decision:** A join event is not attendance. Live attendance is finalised only by a post-meeting reconcile over Zoom's participant report: connected time is the SUM of a student's join segments (capped at scheduled duration), so reconnecting phones are not penalised. Summed time >= attendance.live.minPercent of scheduled duration is PRESENT (LATE if first join is after start + attendance.scan.lateAfterStartMinutes); less is PARTIAL with minutes shown to the teacher and an Accept button (a staff action setting PRESENT with markedById). One shared matcher (preview, apply, webhook): a server-controlled identity first, then a documented fallback; any disagreement is unmatched, never resolved silently (matcher details in the private notes). Only students with an active enrollment whose mode allows live (ONLINE, HYBRID, or PHYSICAL on a session with onlineForPhysical) are credited; teacher and owner participants ignored; preview shows the credited name next to the Zoom display name. Teachers can map unmatched rows to an enrolled student of that course (staff action). Automation: a BullMQ delayed job runs 10 minutes after the Zoom meeting.ended webhook (new subscription on the existing verified endpoint) plus a fallback at scheduled end + 45 minutes; idempotent (job id = session + phase), 3 retries on ZOOM_ATTENDANCE_NOT_READY. Live attendance is finalised only by the post-meeting reconcile. Teacher still reviews unmatched and PARTIAL rows; front desk sees results read-only. Absence SMS for online sessions waits until the reconcile completes (D-OPS-2). Zoom field behaviour must be verified on the staging account before marking done.

**Rationale:** Weak mobile data makes reconnection storms normal; summing is fair and uses data Zoom returns. 50 percent is the informal bar teachers use; PARTIAL lets the teacher forgive a power cut.

**Settings and defaults:** attendance.live.minPercent = 50; attendance.scan.lateAfterStartMinutes = 15 (shared); attendance.live.reconcileDelayMinutes = 10; attendance.live.reconcileFallbackMinutes = 45; retry attempts 3.

**Rejected:** First-join to last-leave span; continuous minimum; webhook as authority; manual only; absolute minutes.

**Reversibility:** Fully; settings; the job can be disabled to return to manual reconcile.

**Code impact:** attendance-reconciliation.service.ts: split loadPreview into actor-free buildPreview(sessionId); sum segments; write via recordAttendance; eligibility; one shared matcher module; new BullMQ queue attendance.queue.ts and processor in the existing worker; schedule from live-class.service on meeting creation; webhook handles meeting.ended. Frontend reconcile panel with minutes, credited name, Accept and Map. Vitest: segment summing, 49/50/51 percent, late flag, matcher disagreement, empty email, ineligible mode, idempotency, not-ready retry. Size M.

### D-ACCESS-7: Recording-watch attendance

**Settles:** F-24, doc 17 §9 item 7

**Question:** Does watching a recording count as attending, and how is it verified?

**Decision:** Watching counts as PRESENT only for ONLINE-mode enrollments (PHYSICAL and HYBRID create no row; their missed class is an EXCUSED mark, D-ACCESS-5). Source VIDEO, shown as 'Recording', lowest precedence. Verification is server-side with a database row: RecordingView (organizationId, userId, videoRecordingId, classSessionId, issuedAt) written whenever a stream token is issued to a student (also feeds F-127 view statistics). POST /attendance/video is accepted only when: the student holds a RecordingView for a READY recording of that session issued within attendance.recording.viewFreshnessHours; the session has ended; at least attendance.recording.minWatchPercent of the recording duration (fallback session duration) has elapsed in wall-clock time since the earliest qualifying issuedAt; the student currently passes isStudentCovered; and it is within attendance.recording.countWithinDays of the session. Never overwrites a stronger source.

**Rationale:** Online-only students on poor data really learn from the recording; physical students would otherwise skip class. A wall-clock lower bound is cheap and needs no per-second tracking on low-end phones.

**Settings and defaults:** attendance.recording.countsAsPresent = ONLINE_ONLY (ONLINE_ONLY|NEVER|ALWAYS); attendance.recording.minWatchPercent = 50; attendance.recording.countWithinDays = 7; attendance.recording.viewFreshnessHours = 6; retention.recordingViewDays applies (D-IDENTITY-9).

**Rejected:** Heartbeat tracking; trusting the client flag; counting for everyone; never counting; a hand-built Redis key as proof (forbidden before M5, data needed anyway).

**Reversibility:** Yes. Setting flips behaviour; RecordingView additive.

**Code impact:** New tenant-owned RecordingView; generateStreamUrl writes a row; markVideoAttendance rewritten with the five checks and recordAttendance(VIDEO); frontend label. Vitest: each condition failing, ONLINE vs PHYSICAL vs HYBRID, future session, stronger source, fast claim. Size M.

### D-ACCESS-8: Who may open recordings: students, owning teacher, owner only

**Settles:** F-04, F-06, doc 17 §9 item 12

**Question:** Which roles may open recordings, and how is access scoped?

**Decision:** Recording stream, metadata get and list are allowed only for STUDENT (enrolled and mode-eligible; coverage gates stream and token issue only, D-MONEY-1), the owning TEACHER (assertCourseAccess) and SUPER_ADMIN. Every other role is refused at the route and again in the service with 403 FORBIDDEN_ROLE. Staff who need to know a recording exists get a boolean hasRecording on the session. Support cases go to the owner via the audited read-only view-as mode (F-127); marking uses exam content. Every non-student stream open (teacher or owner) writes an audit row. One function assertRecordingAccess(actor, video) is used by list, get and stream; students see only READY recordings inside the window of D-ACCESS-9.

**Rationale:** Recordings are the teacher's income; the safe default is a narrow allow-list.

**Settings and defaults:** recordings.staffAuditEnabled = true. No numeric parameters.

**Rejected:** ADMIN opens for support; MARKER opens to check claims; route-level guards only; per-course ADMIN scope.

**Reversibility:** Yes; one allow-list with audit.

**Code impact:** video.routes.ts roles; assertRecordingAccess in video.service.ts for list, get, stream; audit row; hasRecording in the session DTO; fix stale comments claiming Bunny embed tokens are IP-bound. Vitest actor x role matrix. Size S. Wave 0.

### D-ACCESS-9: Recording window, post-enrollment access, missed-class catch-up, lock reason in the list

**Settles:** F-05, F-66, F-97, F-101, F-24, F-88

**Question:** How long may a student watch a recording, what happens when enrollment ends, how does a missed class work, and what does a locked recording say?

**Decision:** ONE window rule (shared with D-MONEY-1): a recording is open to an eligible student when its session date is on or after the first day of the org-timezone month of Enrollment.createdAt minus recordings.joinerBackfillMonths (default 0), AND within recordings.viewWindowDays of the session date (default 90; 0 = unlimited), with a per-course override Course.recordingWindowDays a teacher may set up to recordings.maxWindowDays. Eligibility also needs an active enrollment, a mode that includes online (HYBRID, ONLINE, or PHYSICAL on an onlineForPhysical session) and isStudentCovered (grace included; not trial). AFTER ENROLLMENT ENDS: no access, except ALUMNI access of D-STRUCTURE-6 (BATCH_ENDED enrollments may stream recordings of that course until recordingAccessUntil, ignoring the 90-day and joiner floor). MISSED CLASS: no automatic unlock for a PHYSICAL-only student (2026-11-19 rule); upgrade to HYBRID or the teacher marks the session onlineForPhysical. An optional per-student form, recordings.excusedCatchUpDays, opens that single session to a student the teacher or owner marked EXCUSED, but ships at 0 (off). STORAGE: a recording past its window is hidden from students only; deleteVideoRecording becomes a soft delete (deletedAt); the Bunny asset is purged only by an explicit owner action. OWNERSHIP: recordings belong to the organization; a leaving teacher loses access at deactivation. LOCKED RECORDINGS (F-88): the recording list API returns per item {allowed, reasonCode, month, amount} (amount from computeMonthFee) so the UI shows a lock before tapping and a Pay button with the month and amount.

**Rationale:** 90 days covers a term of revision while protecting the teacher's income from pay-one-month-binge; the joiner floor matches 'you paid for this month onward'. The excused catch-up would touch the decided PHYSICAL-only rule, so it is off until the owner chooses it. Soft delete preserves teacher content.

**Settings and defaults:** recordings.viewWindowDays = 90; recordings.maxWindowDays = 365; recordings.joinerBackfillMonths = 0; recordings.excusedCatchUpDays = 0; Course.recordingWindowDays nullable; fees.graceDays shared; no automatic Bunny purge.

**Rejected:** Unlimited while paid; current month only; automatic unlock for absent physical students; front-desk excuse; automatic Bunny deletion; per-recording expiry dates; separate afterEnrollmentDays and departed-teacher windows (collapsed into alumni access).

**Reversibility:** Yes for all windows; soft delete additive; only the owner purge is irreversible and deliberate.

**Code impact:** Extend assertRecordingAccess and the online path of assertStudentContentAccess with the window check (session date, createdAt, onlineForPhysical, EXCUSED lookup); migration VideoRecording.deletedAt and Course.recordingWindowDays; all video queries filter deletedAt; list payload with reason codes; frontend 'available until' and precise blocked reason. Vitest: day 90 vs 91, joiner month edge, alumni window, override above ceiling, soft-deleted hidden, excused catch-up off and on. Size M.

### D-EXAMS-1: Who may enter marks on an exam

**Settles:** F-67, F-74, doc 17 §9 item 3

**Question:** May a teacher enter marks on their own exam, or only through markers? What about the owner?

**Decision:** Yes. The owning TEACHER and SUPER_ADMIN may enter and change marks on any submission of an exam they control, before results are published, via the existing PATCH /submissions/:id/marks (requireRole adds TEACHER and SUPER_ADMIN; guard assertCourseAccess for them, assertMarker* for MARKER). Markers stay as the optional delegated route. Every mark write records Submission.gradedById. Teacher and owner marks are final against markers: a MARKER write over marks set by a TEACHER or SUPER_ADMIN fails 409 MARKS_SET_BY_TEACHER; a teacher write over a marker's marks is allowed. After publish markers stay locked out and changes use result correction with a reason (first-time marking exception in D-EXAMS-4). Front desk never enters marks.

**Rationale:** The class teacher sets, marks and answers for the monthly test; forcing a marker or publish-then-correct is the audit's dead end. gradedById answers 'who gave this child 12'.

**Settings and defaults:** exams.marking.markerMayOverrideTeacher = false (fixed rule, listed for a future org). Marks stay Int 0..totalMarks.

**Rejected:** Teacher only through markers; marks only after publish via correction; last-writer-wins; front desk keys marks.

**Reversibility:** Fully; role-list change plus a nullable column.

**Code impact:** submission.routes.ts roles; assertMayGradeSubmission(actor); submitMarks takes actor, writes gradedById, enforces MARKS_SET_BY_TEACHER; Submission.gradedById nullable relation SubmissionGrader (Restrict) with index; teacher UI reuses the marker entry control. Size S. Vitest actor x target matrix.

### D-EXAMS-2: Hall (in-class, paper) marks entry

**Settles:** F-13, F-17, F-95

**Question:** How do marks for paper exams sat in the hall get into the system, and who may type them?

**Decision:** One bulk endpoint PUT /exams/:examId/hall-marks taking rows {indexNumber, marks}. It creates or updates one COMPLETED Submission per row (Submission.source = HALL, no answers, marks and gradedById set), keyed by unique (userId, examId). Eligible: for INCLASS, any active enrollment in the course; for a scoped exam, only participants whose audience deliveryMode is PHYSICAL; otherwise refused. Absent students are omitted (no row, never a fake 0); results show enrolled students without a row as Absent. Who: owning TEACHER, SUPER_ADMIN, and a MARKER assigned to the exam or physical audience; never front desk or students. Two-step: dryRun=true writes nothing and returns matched, unknown or ineligible index numbers, duplicates and out-of-range marks (student NAMES only for TEACHER and SUPER_ADMIN; a MARKER sees index numbers and statuses only); dryRun=false applies all rows in one transaction or none. Input is pasted list or CSV (index,marks); no Excel parser in v1. Before publish only; afterwards via the correction path (D-EXAMS-4). Delegation is by assigning a MARKER (D-EXAMS-9).

**Rationale:** Paper tests are the normal case for physical students; all-or-nothing with a preview prevents the wrong-index mistake that puts a mark on another child. Omitting absentees avoids false zeros. Reusing Submission keeps publish, notify, correction and progress working.

**Settings and defaults:** exams.hallMarks.maxRowsPerBatch = 500; exams.hallMarks.allowDecimal = false.

**Wave 1 implementation (#109, unreleased):** `PUT /exams/:id/hall-marks` with a dry run, all rows or none, and the audit row in the same transaction. `exams.hallMarks.allowDecimal` is registered but inert: `Submission.marks` is an integer column, so a decimal is refused rather than rounded. Honoring the setting needs a column type change across marking, results and exports, so it stays a later migration.

**Rejected:** Per-student form only; Excel import; front desk types marks; writing absent as 0; a new HallMark table.

**Reversibility:** Yes. Additive endpoint and one defaulted column.

**Code impact:** Submission-hall service with resolve-by-indexNumber scoped to the exam's organization (not the global unique), eligibility, dryRun, transactional upsert, batch audit row, Idempotency-Key; enum SubmissionSource {ONLINE, HALL}; teacher and marker 'Enter hall marks' page. Size M. Tests: unknown index, not enrolled, wrong audience mode, duplicate index, mark above total, published exam, marker assigned or not, dryRun writes nothing, rerun idempotent, marker never sees names.

### D-EXAMS-3: Sitting a scoped (paper-revision) exam without choosing an audience

**Settles:** F-17, F-22, F-23

**Question:** How does a student sit a scoped exam when the API demands an audienceId the UI never sends?

**Decision:** The client never sends an audience; the server derives it. ExamParticipant is unique on (examId, userId), so a student has one audience per exam. startSubmission and assertStudentExamStartAccess look up the participant row by (examId, userId) and require an ONLINE audience; audienceId in the body becomes optional and, if sent, must match. GET /exams and GET /exams/:id for a STUDENT include myAudience {label, deliveryMode, instituteName?}. ONLINE shows Start; PHYSICAL shows 'Your paper is in the hall at <institute>, no online submission'; no participant row hides the exam ('You are not on the list, ask your teacher'). Legacy exams unchanged.

**Rationale:** Students on low-end phones cannot pick among audiences they were never told about; the roster already determines it.

**Settings and defaults:** None.

**Rejected:** Audience picker; separate my-audience call; dropping the participant check.

**Reversibility:** Fully; clients still sending audienceId keep working.

**Code impact:** assertStudentExamStartAccess findUnique on examId_userId; submission.service.ts same lookup in the transaction; schema audienceId optional; exam.service student DTO myAudience; frontend three states. Combine with the F-22 retry fix. Size S.

### D-EXAMS-4: Publish, unpublish, re-publish and completeness of results

**Settles:** F-71, F-126, F-123

**Question:** What must be true to publish results, can they be unpublished, may exams exist as drafts?

**Decision:** 1) Completeness: publish returns the count of submissions with no marks; if any, 409 UNGRADED_SUBMISSIONS unless confirmUngraded=true ('N of M papers have no marks. Publish anyway? They show as Result pending.'); switchable to BLOCK. Absent hall students are not ungraded. 2) First marks after publish: for a COMPLETED submission whose marks are still null, the owning teacher, SUPER_ADMIN and assigned marker may enter marks without a correction reason; writes gradedById; notifies only that student (RESULTS_UPDATED). Changing existing marks after publish still needs correction with reason and audit. 3) Unpublish: owning teacher within exams.results.unpublishWindowHours, SUPER_ADMIN anytime; reason required, Idempotency-Key, audit; re-hides marks and re-enables markers; never reopens sitting (start and complete check the effective end time, not isPublished); sends no message. 4) Re-publish notifies only students whose gradedAt is later than the exam's unpublishedAt. 5) No draft flag; mistakes are fixed by edit or delete before the first submission (F-123). New Exam.publishedAt, publishedById, unpublishedAt.

**Rationale:** Teachers publish with a few papers unmarked; confirm-and-warn makes it conscious without blocking. A 72-hour teacher window covers 'noticed the same evening'; later hiding is confusing after parents reacted. Notifying only changed students saves SMS cost.

**Settings and defaults:** exams.publish.ungradedPolicy = WARN (WARN|BLOCK); exams.results.unpublishWindowHours = 72; exams.results.republishNotifyChangedOnly = true.

**Rejected:** Hard block; irreversible publish; unlimited teacher unpublish; draft flag; whole-class notify; reopening one submission.

**Reversibility:** Yes. Nullable columns, notification type, settings.

**Code impact:** New exam-results.service.ts (publish with count and confirm, unpublish, republish, first-marking exception); route POST /submissions/exam/:examId/unpublish with checkIdempotency; Exam columns; NotificationType += RESULTS_UPDATED (seeded per D-OPS-2); guard start and complete on effective end time. Size M. Tests: confirm gate, window boundary teacher vs owner, markers locked then unlocked, notify only changed, first mark needs no reason.

### D-EXAMS-5: Late work: per-student extension, late flag, make-up exam, upload grace

**Settles:** F-126, F-22

**Question:** What is the late-work policy and does it affect ranking?

**Decision:** 1) Before publish, the owning TEACHER or SUPER_ADMIN grants a per-student extension: a new individual end time with a reason, at most exams.extension.maxDaysPastEnd days after exam end, stored in ExamStudentWindow (one row per exam and student); effective end = later of exam.endTime and the student's window end, used by start and complete. Granting notifies the student (in-app plus EXAM_EXTENSION_GRANTED SMS to the student, or guardian if minor per D-IDENTITY-3); the grantor can revoke before use. Publish is refused while any extension is open (names the students). 2) A submission after the exam's own end time is flagged Submission.isLate, staff-only, no automatic penalty. 3) After publish there are no extensions; a late student sits a make-up exam = a new scoped exam of the same paper with one participant. 4) Late sitters with a granted extension are ranked normally. 5) The hard-coded 60 s upload grace becomes exams.uploadGraceSeconds (180). No auto-extend, no reopen, no front-desk authority.

**Rationale:** Real cases are illness, bereavement, power cuts; the teacher knows and decides. No automatic penalty because formulas get disputed; ranking a genuinely ill child down is harsh. 60 s upload grace is too short on 3G for a scanned PDF.

**Settings and defaults:** exams.extension.maxDaysPastEnd = 7; exams.extension.requireReason = true; exams.uploadGraceSeconds = 180; exams.late.includeInRank = true; exams.late.autoPenaltyPercent = 0 (reserved, not built).

**Rejected:** Automatic penalty; unpublish for all; reopen a submission; exclude from rank; front desk grants extensions.

**Reversibility:** Yes. Additive table and flag; falls back to exam.endTime when empty.

**Code impact:** New tenant-owned ExamStudentWindow (organizationId, relation, index, unique (examId,userId)); Submission.isLate; exam-window.service.ts with effectiveEnd and assertCourseAccess; start, complete and publish guards; routes POST/DELETE /exams/:id/extensions with Idempotency-Key; frontend 'Give more time'. Size M. Tests: granted vs not, cap exceeded, after publish refused, publish blocked while open, late flag, revoke, other teacher 403.

### D-EXAMS-6: Ranks, class statistics, top scorers and progress for minors

**Settles:** F-73, F-102

**Question:** Who sees ranks and top-scorer lists, especially about minors, and is there a cumulative progress view?

**Decision:** 1) Staff view: GET /exams/:id/results for the owning TEACHER and SUPER_ADMIN only returns every enrolled student sorted high to low with competition rank (1,2,2,4), absent and pending flags, class count, average, median, highest, lowest, with CSV export (audited). Computed on read. 2) Student view governed by exams.results.studentVisibility = MARKS_ONLY | MARKS_AND_AVERAGE | MARKS_AVERAGE_RANK; default MARKS_AND_AVERAGE (own marks, class average and size, no rank). With RANK a student sees only their own position ('12 of 38'), never anyone else's identity or mark; only after publish. 3) No named top-scorer list or leaderboard visible to students or parents (needs guardian consent the product does not capture); a teacher who wants a notice board prints the staff sheet and decides offline. 4) Progress: GET /courses/:id/students/:userId/progress?from&to (teacher own course, SUPER_ADMIN) and a student route for own progress, path fixed in the endpoint doc (published exams with own marks, percent, class average, own rank only if allowed, simple trend); no parent delivery yet. 5) No percentile or cross-class ranking.

**Rationale:** Sri Lankan A/L and O/L culture is rank-oriented and teachers need the sorted sheet, but many students are minors and public ranking causes harm; marks plus class average gives context without comparison to named peers. Conservative default, one-switch opt-in.

**Settings and defaults:** exams.results.studentVisibility = MARKS_AND_AVERAGE; exams.results.minClassSizeForAverage = 5; exams.results.rankTies = COMPETITION; exams.results.namedLeaderboards = false (fixed off until a consent flag exists); progress.defaultRangeDays = 180.

**Rejected:** Always show rank; never show rank; public named widget; percentiles; per-teacher visibility settings.

**Reversibility:** Yes. Computed on read, governed by a setting.

**Code impact:** exam-results.service.ts (sheet and statistics, assertCourseAccess); student result adds average and optional rank per setting; progress.service.ts; streaming CSV with audit row. Size M. Tests: ties, absent vs zero, ungraded excluded, hidden for markers and front desk, small-class average suppression, own rank only, unpublished invisible, cross-teacher 403.

### D-EXAMS-7: Teacher roster with paid or unpaid state

**Settles:** F-83

**Question:** May a teacher see who in their class has and has not paid this month?

**Decision:** Yes, as a three-value state only. GET /classes/:id/roster (TEACHER own course via assertCourseAccess, ADMIN, SUPER_ADMIN) returns per active enrollment {studentId, name, indexNumber, classType, enrolledAt, feeState PAID | NOT_PAID | TRIAL, attendedLastN} and nothing else: never phone, NIC, address, email, amounts, method, collector, concession type or reason. PAID means a SUCCESS row for the current org-timezone month (a free-card zero row counts); it is deliberately NOT grace-aware (so the teacher sees who actually paid) and may therefore differ from the content gate. No CSV export for teachers (owner console only). The teacher cannot contact students from it; reminders stay with front desk and owner. A derived 'Repeater' badge comes from D-STRUCTURE-6. The owner can turn the fee column off organization-wide.

**Rationale:** A class list with a tick for paid is a standard teacher tool and income depends on it; without it teachers keep private notebooks and chase minors publicly. The three-value state gives the need without amounts or contacts.

**Settings and defaults:** roster.showPaidState = true; roster.attendanceWindowSessions = 8; roster.pageSize = 100.

**Rejected:** No paid state; amounts and method; phone numbers; teacher CSV; grace-aware state.

**Reversibility:** Yes. Read-only endpoint; setting.

**Wave 1 implementation (#116, unreleased):** built as decided, with two differences. The `TRIAL` value and the Repeater badge wait for trial months and D-STRUCTURE-6 (Wave 2c); until then a row is `PAID` or `NOT_PAID`. The attendance count is over the last `roster.attendanceWindowSessions` held sessions of the whole class, not per cohort. The teacher Present and Undo toggles (D-EXAMS-8) and the 'absent' filter are not part of this step. `roster.service.ts` returns exactly seven keys per row, asserted by a key-set test; the class page shows the section to the owning teacher, front desk and owner and hides it when the API answers 403.

**Code impact:** roster.service.ts: enrollments (deletedAt null, course active) left-joined to current-month Payment, count Attendance for the last N sessions excluding voided; select-only whitelist asserted by a Vitest key test; route with verifyToken and requireRole(SUPER_ADMIN, ADMIN, TEACHER); 'Students' tab reused for D-EXAMS-8. Size M. Tests: other teacher 403, whitelist, Colombo midnight, dropped excluded, setting off.

### D-EXAMS-8: Teacher attendance writes and corrections

**Settles:** F-35, F-83

**Question:** Can a teacher mark or undo attendance for their own class, and can a wrong mark be corrected?

**Decision:** Yes, with soft voiding. The owning TEACHER and SUPER_ADMIN may mark a student present on a session of their course (POST /attendance/manual adds TEACHER with assertCourseAccess on session.courseId; a TEACHER target must hold an active enrollment). Attendance rows are never deleted: voidedAt, voidedById, voidReason (columns in the single Attendance migration, D-ACCESS-5). A manual mark on an existing non-voided row changes nothing about its source; on a voided row it reinstates it with an audit row. Void (POST /attendance/:id/void, mandatory reason) is allowed for the owning TEACHER within attendance.correctionWindowHours of session start, for front desk within attendance.frontDeskWindowHours, SUPER_ADMIN anytime. LATE, PARTIAL and EXCUSED exist as defined in D-ACCESS-5; the teacher may set EXCUSED within attendance.excuseWindowDays. All reads, counts, absence SMS and reconciliation ignore voided rows. Teacher UI is the D-EXAMS-7 roster with Present and Undo toggles.

**Rationale:** Scanners misfire and siblings share phones; teachers know who is in the room and today cannot fix it, and the manual path overwrites the QR source. A time-boxed correction window stops month-end tampering.

**Settings and defaults:** attendance.correctionWindowHours = 72; attendance.frontDeskWindowHours = 24; attendance.excuseWindowDays = 14; attendance.teacherMayMark = true; attendance.voidReasonMinLength = 3.

**Rejected:** Hard delete; teacher cannot mark; unlimited corrections; overwrite source; no EXCUSED.

**Reversibility:** Yes. Additive columns; voiding is reversible by reinstatement.

**Code impact:** markManualAttendance gains actor, assertCourseAccess, enrollment check and no source overwrite; new voidAttendance; every read adds voidedAt: null; routes add TEACHER to /manual and new POST /attendance/:id/void with Idempotency-Key; audit rows; roster Present and Undo; StaffScanner Undo for ADMIN. Size M. Tests: actor x target matrix, window edges, non-enrolled target, source preserved, voided excluded, reinstatement, double void idempotent.

### D-EXAMS-9: Assistants and delegates (no new role in v1)

**Settles:** F-95

**Question:** Does a teacher get an assistant role, and do teachers or assistants handle money?

**Decision:** No assistant role and no TeacherDelegate model. No teacher, marker or assistant records or holds institute money in the platform; the three decided channels (PayHere, front-desk cash, staff-approved slip) are the only ways a payment is recorded, and the collector on a cash payment is always a front-desk ADMIN or the owner. A teacher or helper who physically receives cash hands it to the front desk, which records it under the front-desk user; there is no teacher-collected channel or cash-handover table. This deliberately departs from the doc 17 section 12 'assistant with cash handover' proposal. Non-money delegation uses what exists: the teacher's own attendance powers (D-EXAMS-8), front desk, and a MARKER assigned to an exam (D-EXAMS-1, D-EXAMS-2). Revisit only if the owner names a concrete task those cannot do.

**Rationale:** A delegate role touches every course-scoped guard and creates the largest fraud surface; it contradicts the decided three channels. Teachers' real delegations (attendance, typing marks) are already covered.

**Settings and defaults:** None. Reserved: delegates.enabled = false (not built).

**Rejected:** ASSISTANT role; TeacherDelegate link; cash-handover ledger; teachers collect fees.

**Reversibility:** Yes; nothing is built.

**Code impact:** None beyond D-EXAMS-1, -2, -8. Add a guard test that no payment-creating route accepts TEACHER or MARKER, and a runbook note.

### D-EXAMS-10: Substitute teachers and co-teachers

**Settles:** F-96

**Question:** Can a session name a substitute or be a make-up, and can a course have a co-teacher?

**Decision:** Substitute: yes, per session only. ClassSession gets substituteTeacherId and makeupForSessionId (nullable). The owning TEACHER may name a substitute from the other TEACHERs linked to the same Subject (sessions.substitute.sameSubjectOnly), within sessions.substitute.maxDaysAhead days; SUPER_ADMIN may name any active TEACHER; either clears it. Effective at once, audit row, in-app notice to owner and substitute (owner can revoke). The substitute has session-scoped authority only (schedule or host the Zoom meeting, view that session's roster and attendance, mark and void attendance for it); nothing course-level (no exams, marks, payments, income, other sessions, materials, recordings). Implemented as assertSessionAccess(sessionId, actor) used only on those session routes; assertCourseAccess unchanged. Income does not change (the course owner keeps income and settles outside the platform). A make-up session carries makeupForSessionId, needs no fee rule, and counts like any session. Co-teacher: no; one owning teacher per course; two teachers on one subject are two classes, or the owner acts through SUPER_ADMIN. Zoom concurrency applies (D-OPS-4).

**Rationale:** A teacher falls ill and a colleague covers a session by phone; it must work the same morning. Same-subject pool and session-only scope stop a one-day cover from reaching another teacher's data. Co-teaching is rare and would touch every ownership guard and the income statements.

**Settings and defaults:** sessions.substitute.teacherMayNominate = true; sessions.substitute.sameSubjectOnly = true; sessions.substitute.maxDaysAhead = 30.

**Rejected:** Owner-only approval; any teacher; CourseTeacher co-teacher table; substitute inherits the course.

**Reversibility:** Yes. Two nullable columns and one guard.

**Code impact:** ClassSession.substituteTeacherId (relation SessionSubstitute, Restrict, indexed) and makeupForSessionId; assertSessionAccess; set and clear with pool check, audit, notification; live-class host/schedule, attendance and manual/void accept the substitute for that session; timetable shows 'Substitute: name'. Route PATCH /class-sessions/:id/substitute. Size M. Tests: in pool, outside pool, session-scoped only, other teacher 403, SUPER_ADMIN any, host JWT only for that session.

### D-EXAMS-11: Where the exam-cluster defaults live

**Settles:** F-67, F-71, F-73, F-83, F-35, F-96, F-126, F-102

**Question:** Where do the numeric and policy defaults of this cluster live so they are settings, not constants?

**Decision:** In the single OrganizationSetting registry owned by D-MONEY-10; this cluster registers keys and adds no store. Keys registered (plus the keys named in D-EXAMS-2, -5, -6 and D-ACCESS-2): exams.marking.markerMayOverrideTeacher=false; exams.hallMarks.maxRowsPerBatch=500; exams.publish.ungradedPolicy=WARN; exams.results.unpublishWindowHours=72; exams.results.republishNotifyChangedOnly=true; exams.extension.maxDaysPastEnd=7; exams.extension.requireReason=true; exams.uploadGraceSeconds=180; exams.autoSubmitLeadSeconds=15; exams.late.includeInRank=true; exams.results.studentVisibility=MARKS_AND_AVERAGE; exams.results.minClassSizeForAverage=5; roster.showPaidState=true; roster.attendanceWindowSessions=8; attendance.correctionWindowHours=72; attendance.teacherMayMark=true; sessions.substitute.*. Only SUPER_ADMIN changes them, audited.

**Rationale:** The owner will tune rank visibility and correction windows after real use without a deploy; one store avoids four competing designs.

**Settings and defaults:** As listed. No cache setting.

**Rejected:** Constants; env vars; Json column per organization; row-per-setting with its own table; per-teacher overrides.

**Reversibility:** Yes. Removing a key falls back to the registry default.

**Code impact:** Each service reads keys through settings.service.ts (D-MONEY-10); no new schema from this decision. Tests: defaults, out-of-range rejected, non-owner 403, tenant isolation after M2.

### D-IDENTITY-1: Minors, NIC numbers and photos, and the account-setup gate

**Settles:** F-19, F-29, F-30

**Question:** Are NIC photos required, for whom, who may view them, how long are they kept, and is the setup gate a real control?

**Decision:** Stop collecting NIC photos. The NIC number is optional, never requested from anyone under identity.minorAgeYears (18), and is recorded only by SUPER_ADMIN (D-IDENTITY-12). Identity is established by the front-desk visit. identity.collectNicPhotos defaults false; if an owner ever enables it it applies to adults only and a SUPER_ADMIN reviewer view (short-lived presigned GET, one AuditLog row per view) must exist first. Existing NIC photos are deleted by a one-off purge script, REPORT_ONLY (dry-run count) first and ENFORCE only after the account-setup NIC step is removed and a backup exists; nicFrontUrl and nicBackUrl are then nulled. setupCompleted becomes a profile-completeness flag computed on write: true when the student has a mobile of their own or a guardian mobile and, for a minor, a guardian with consent (D-IDENTITY-2). It is enforced in a backend guard requireSetupCompleted on STUDENT enroll, live and recording token issue and exam sitting, NEVER on payment initiation (a parent must always be able to pay). Existing students are backfilled setupCompleted=true so nobody is locked out at launch; those without a date of birth are treated as minors for SMS and privacy purposes and appear on a 'missing details' filter for the front desk.

**Rationale:** Nothing reads the photos, so they are pure liability (a stolen bucket leaks every student's ID). Many O/L students have no NIC, so a mandatory NIC wrongly blocks a cohort; at a cash institute the real check is a human who knows the family. A server-side gate removes the F-29 dead end; backfill avoids a launch-day lockout.

**Settings and defaults:** identity.minorAgeYears = 18; identity.collectNicPhotos = false; identity.nicNumberRequired = false; identity.requireGuardianForMinors = true; identity.nicPhotoPurge.mode = REPORT_ONLY then ENFORCE.

**Rejected:** Mandatory NIC for all; NIC for adults plus a review queue; keep photos with a viewer; browser-only gate; gating payment initiation.

**Reversibility:** Policy reversible; the photo purge is irreversible by design (no role could view the files). Confirm R2 DeleteObject permission on the scoped key before the enforce run.

**Code impact:** OrganizationSetting is D-MONEY-10 (this decision adds only keys). registerSchema and auth.service drop NIC fields; NIC upload endpoints removed or setting-gated; requireSetupCompleted middleware reading one cached column from the same per-request user lookup as F-15; scripts/purge-nic-photos.ts; backfill migration; frontend profile-complete form. Size M. Purge output is never committed to the repo.

### D-IDENTITY-2: Guardian record, date of birth, consent, siblings and index-number sign-in

**Settles:** F-98, F-25 (capture)

**Question:** Do we model guardians, store a date of birth and consent, link siblings, and give a shared-email family a way to sign in? Does the guardian get a login?

**Decision:** Add a Guardian record, not a guardian login: Guardian(organizationId, name, phone, relation, preferredLanguage, smsOptOutAt, noticeSentAt); phone is not unique, front desk matches by (organizationId, phone) to reuse one row for siblings. User gains dateOfBirth, guardianId, guardianConsentAt, guardianConsentSource (SELF_DECLARED | FRONT_DESK | WRITTEN_FORM), guardianConsentNoticeVersion, preferredLanguage. Rule: a student under identity.minorAgeYears must have a guardian with a mobile and a consent record; consent is a ticked declaration at registration or a front-desk confirmation at first visit. When a guardian is first linked, one GUARDIAN_NOTICE SMS ('You are listed as guardian of {studentName} at {instituteName}. Call {frontDeskPhone} to correct or stop messages') is sent; it is a notice, not an OTP, and is one of the two new SMS types seeded enabled (D-IDENTITY-3); the notice SMS is governed by the GUARDIAN_NOTICE NotificationSetting row, seeded enabled. A front-desk 'guardian opted out' action sets smsOptOutAt. Sign-in identifier: email OR index number (digits only is the index) plus password, with a per-identifier plus per-IP rate limit. User.email becomes nullable for STUDENT only (DB CHECK: non-STUDENT roles require email), unique per organization when present (with the M3 swap). No guardian portal in v1; Guardian is the anchor if one is added (R-USR-02 stays Planned). Sibling concessions use the Guardian link only as a suggestion (D-MONEY-3).

**Rationale:** The parent's phone is the contact that matters, parents will not create accounts, and many children have no email. One guardian row for siblings gives one fee SMS per family. The notice SMS catches mistyped numbers and gives a wrong recipient a way out.

**Settings and defaults:** identity.minorAgeYears = 18 (shared); identity.consentNoticeVersion = 1; identity.allowIndexNumberLogin = true.

**Rejected:** Guardian user account; flat guardian fields on User; unique guardian phone; phone as sign-in id; OTP-verify guardian phone at registration.

**Reversibility:** Yes for fields and rules; nullable email is reversible while no emailless student exists; consent records are append-only facts.

**Code impact:** Prisma Guardian model, User fields, email nullable plus CHECK, per-org unique swap with M3; auth.service register and login; user.service link, consent; guardian.service; update every type assuming user.email non-null (SafeUser, token issue, notifications); registration form and staff guardian panel. Size M-L. Vitest: age boundary (turns 18 today), shared guardian siblings, opt-out, index-number login rate limit.

### D-IDENTITY-3: SMS recipients, languages, quiet hours and SMS budget (event catalogue is D-OPS-2)

**Settles:** F-25, F-122, F-75, F-72, F-76 (recipient and channel rule)

**Question:** Who receives which SMS, in which language, over which channel, and how are cost and night noise controlled?

**Decision:** SMS is the only outbound channel at launch; WhatsApp is deferred. Recipients are fixed per event type in code: MONEY events (PAYMENT_CONFIRMED, PAYMENT_OVERRIDDEN, FEE_DUE, FEE_CHANGED, refund) and ABSENCE go to the guardian's mobile when the student is a minor with a linked, non-opted-out guardian, otherwise to the student's own mobile; class-operational events (session cancelled or rescheduled, exam scheduled, extension granted, RESULTS_PUBLISHED and RESULTS_UPDATED) go to the student's own mobile. Marks, rank and other families' amounts are never in an SMS; RESULTS_PUBLISHED carries no marks. One SMS per event type per day per recipient phone lists up to three names then 'and N more'. New SMS types are seeded DISABLED in NotificationSetting except PAYMENT_CONFIRMED (as today), FEE_CHANGED and GUARDIAN_NOTICE; the owner enables the rest after a trial week (D-OPS-2). Existing types RESULTS_PUBLISHED and PAYMENT_OVERRIDDEN keep their current setting; only new types follow this seed. Quiet hours 21:00-07:00 Asia/Colombo: non-urgent SMS wait in the BullMQ queue; exempt are PAYMENT_CONFIRMED, one-time codes, and SESSION_CANCELLED or RESCHEDULED when the session starts within sms.urgentWithinHours. Templates exist in English, Sinhala and Tamil (Unicode, written to fit sms.maxSegments segments, variables truncated); a missing translation falls back to English, and Sinhala and Tamil go live per type only after a native-speaker proofread. Language is per recipient: Guardian.preferredLanguage, User.preferredLanguage, default Organization.locale. Every template starts with {instituteName}; PAYMENT_CONFIRMED adds amount and receipt number. Monthly SMS budget: owner alert at sms.budgetAlertPercent; at 100% only PAYMENT_CONFIRMED and security codes still send. SmsLog masks the body for templates flagged sensitive (codes). Prerequisite: delete sendResultsSms from submission.controller.ts (F-75) before guardian fan-out so results cannot double-send.

**Rationale:** SMS reaches feature phones; WhatsApp needs a provider credential read from env (forbidden before M4), template approval and per-conversation charges. Guardian-for-money and absence is what parents of minors expect; keeping marks out protects minors. Disabled-by-default prevents a launch-day flood; Unicode SMS costs two to three times Latin, so the cap and length limits are cost controls.

**Settings and defaults:** sms.monthlyCap = 6000; sms.budgetAlertPercent = 80; sms.quietHours.start = 21:00; sms.quietHours.end = 07:00; sms.urgentWithinHours = 12; sms.maxSegments = 2; sms.defaultLocale = Organization.locale; sms.groupSiblingsByPhone = true; sms.guardianResultsNotice = false; sms.template.sensitiveMasking = true.

**Rejected:** WhatsApp at launch; per-user channel choice; send to both guardian and student; marks or rank in SMS; owner-editable template table; all events enabled by default.

**Reversibility:** Fully; settings, seed defaults and template constants; WhatsApp can be added as a NotificationChannel value later.

**Code impact:** notification.service.ts recipientsFor(type, user, guardian) pure function; per-type seed default in notification-setting.service; NOTIFICATION_TEMPLATES becomes {en,si,ta} per type; sms-notification.service sensitive masking, quiet-hours delay, segment guard, org-scoped budget counter; remove sendResultsSms; preferredLanguage fields; worker delayed send. Translation proofreading is person-days, not code. Size M.

### D-IDENTITY-4: Per-user Permission overrides

**Settles:** F-27

**Question:** Keep the per-user Permission override model or remove it?

**Decision:** Delete the Permission model and every doc claim about fine-grained per-user overrides. Authorization is the role plus resource and target guards (assertCourseAccess, assertCanManagePrivilegedTarget, assertSessionAccess) plus the owner-set caps held in their own tables (TeacherMoneyLimit). If a real exception need appears, build a typed capability enum with one enforcement helper and a Vitest matrix then, not a free-form Json column. The migration refuses to run if any Permission row exists.

**Rationale:** Dead code that docs advertise as enforced is worse than absent: an owner could believe a clerk was restricted. Free-form Json overrides are a bad design where one missed guard has already caused incidents.

**Settings and defaults:** None (a removal).

**Rejected:** Keep for future use; build enforcement now.

**Reversibility:** Yes. Re-adding is one migration; no data exists.

**Code impact:** Drop model Permission and the back-relations on Organization and User; update the tenant-integrity registry test and migration guard; seed-demo if it references it. Size S.

### D-IDENTITY-5: Owner invariants, seed behaviour and step-up confirmation

**Settles:** F-31, F-28, F-119 (backend half)

**Question:** What invariants protect the owner account and how is a lost owner password recovered?

**Decision:** Inside one transaction that first takes a per-organization advisory lock (withAdvisoryLock on organizationId plus 'owner'): (1) the API can never assign the SUPER_ADMIN role; (2) nobody changes the role or active status of their own account; (3) the last active SUPER_ADMIN of an organization can never be demoted or deactivated; (4) at most identity.maxOwners (2) active SUPER_ADMINs. Adding a co-owner and owner password recovery are done only by operator CLIs (npm run owner:add, npm run owner:reset-password) because the person running the server is the only party who can prove ownership; both write an AuditLog row, prompt interactively or print a generated secret once on the operator's terminal, and never place a secret in shell history, logs or audit metadata. A second SUPER_ADMIN may deactivate the other via the API (never themselves). seed-admin.ts becomes create-only: it does nothing if any SUPER_ADMIN exists for the organization; the destructive path moves to the explicit CLI (this fix is Wave 0: the seed is not safe to re-run today). Step-up: these actions require the actor's current password in the request body: change a role, deactivate a TEACHER/ADMIN/MARKER or another SUPER_ADMIN, create or reset a staff account, run an erasure. The Users screen asks for a reason (AuditLog metadata) on role change and shows a confirmation naming the account and from-to role.

**Wave 0 implementation:** The owner cap and API step-up confirmation are deferred to Wave 1 with the settings registry; operator CLI additions are uncapped until then. Live access-token revocation remains F-15; role changes and deactivation revoke refresh tokens.

**Wave 1 implementation (#108, unreleased):** the owner cap is enforced by `owner-add` (`identity.maxOwners`), per-request revocation (F-15) is in place through a per-user session version, and step-up is live for staff password reset (F-03). Step-up for role change and deactivation is still to do.

**Rationale:** Owner lockout is the real risk of a single account with no recovery path; a CLI-only mint and recovery keeps a stolen front-desk or teacher session (or a compromised owner session) from creating a persistent all-powerful account. Password re-entry costs seconds and defeats the unattended-laptop case. The lock closes the race where two owners demote each other.

**Settings and defaults:** identity.maxOwners = 2; identity.stepUp.required = true; identity.stepUp.actions = [ROLE_CHANGE, STAFF_DEACTIVATE, STAFF_CREATE, STAFF_PASSWORD_RESET, ERASURE]; identity.roleChange.reasonRequired = true. Depends on F-15 revocation (D-IDENTITY-6).

**Rejected:** Exactly one owner with no CLI; SUPER_ADMIN minting via UI; email-based recovery (no email infrastructure); no step-up.

**Reversibility:** Yes. Cap and step-up are settings; the CLIs add capability without removing any.

**Code impact:** user.service updateRole and updateStatus gain actor, transaction, lock, self and last-owner checks; verifyActorPassword helper; seed-admin.ts create-only plus scripts/owner-add.ts and owner-reset-password.ts; AuditLog actions ROLE_CHANGED (reason), OWNER_ADDED, OWNER_PASSWORD_RESET; UsersTable confirmation modal. Size S-M. Vitest actor x target matrix including two concurrent demotions (lock mocked), self-demotion, last owner.

### D-IDENTITY-6: Who may change a role or deactivate staff, and the hand-over guard

**Settles:** F-32, F-107, F-82, F-15

**Question:** May front desk deactivate teachers and markers, and must a teacher's classes be handed over first?

**Decision:** Status matrix: ADMIN may activate or deactivate STUDENT accounts only; SUPER_ADMIN alone may deactivate or reactivate TEACHER, MARKER, ADMIN (and another SUPER_ADMIN per D-IDENTITY-5). Role change is SUPER_ADMIN only, among TEACHER, ADMIN and MARKER with a reason; a STUDENT is never promoted to staff and staff are never demoted to STUDENT (create the staff account via D-IDENTITY-7 and deactivate the old one). OWNER OF THE GUARD AND PAYLOAD: deactivating or re-roling a TEACHER who owns active or ended courses, upcoming sessions (within identity.handoverLookaheadDays), open exams or marking assignments is refused 409 TEACHER_HAS_CLASSES with a structured list unless the request carries handover = [{courseId, toTeacherId}] (or handoverAllTo for all), which the service applies in the same transaction (mechanics, conflict check, income dating in D-STRUCTURE-9); a MARKER with open allocations is refused or auto-released to the exam owner. Every deactivation writes an AuditLog row with reason, revokes refresh tokens, and the account is rejected at the next request. Dependency F-15: add a per-request account-state check (status, role, tokenVersion), no Redis key (hand-built keys are forbidden before M5).

**Rationale:** Front desk handles students and cash; removing a teacher is an employment decision that belongs to the owner, and a mistaken click can orphan a class that earns a teacher's income. A blocking handover list turns silent corruption into a checklist.

**Settings and defaults:** identity.staffDeactivate.requireHandover = true; identity.handoverLookaheadDays = 14; targets validated as active TEACHERs of the same organization.

**Rejected:** Front desk deactivates with a warning; deactivate then fix orphaned classes; auto-reassign to the owner (SUPER_ADMIN is not a TEACHER).

**Reversibility:** Yes. Service checks; reactivation by SUPER_ADMIN.

**Code impact:** user.service updateStatus and updateRole add actor, target-role matrix and handover query (shared with the F-107 orphaned-classes query); routes accept the handover payload; deactivate dialog showing the list and hiding buttons the viewer cannot use (F-119 UI). F-15 per-request lookup and tokenVersion. Size S-M. Tests: actor x target x has-courses matrix.

### D-IDENTITY-7: Staff account creation and password reset

**Settles:** F-21, F-03

**Question:** How are teacher, front-desk and marker accounts created and how does someone who forgot their password get back in?

**Decision:** Staff creation: SUPER_ADMIN-only POST /users/staff creates a TEACHER, ADMIN or MARKER (never SUPER_ADMIN) with a system-generated one-time temporary password (identity.tempPassword.length characters from an unambiguous alphabet), mustChangePassword=true, setupCompleted=true. It is shown once on screen to the owner, who hands it over in person; never sent by SMS or email, never in logs, audit metadata or SmsLog. Password reset: POST /users/:id/reset-password issues a new temporary password the same way; ADMIN may reset STUDENT targets only; SUPER_ADMIN may reset any non-self target EXCEPT another SUPER_ADMIN (owner recovery is CLI-only, D-IDENTITY-5). The actor records how identity was confirmed (IN_PERSON_CARD | GUARDIAN_PHONE | OWNER_KNOWS) in the audit row. Both endpoints revoke the target's refresh tokens, need step-up for staff targets, are rate limited per actor and per target, never persist or replay the secret in any cache, log or audit record. mustChangePassword is enforced server-side: verifyToken's per-request user lookup limits such an account to /auth/me, /auth/refresh, change-password and logout. Self-service SMS reset for students is off by default (identity.selfServiceReset.enabled = false): a 6-digit code hashed in a Postgres OneTimeCode table (organizationId, userId, purpose, codeHash, expiresAt, attempts, consumedAt; no Redis), sent only to a verified phone with a masked SmsLog body; it must not be enabled until phone changes are verified (D-IDENTITY-10).

**Wave 1 implementation (#108 reset, #110 creation, unreleased):** `POST /users/staff` and `POST /users/:id/reset-password` are live with owner password step-up (`STAFF_CREATE`, `STAFF_PASSWORD_RESET`). The print slip is not built: the dialog has a copy button only. An invite link and email verification remain later work.

**Rationale:** At a cash institute the clerk who knows the family is the realistic recovery path and costs no SMS. Reset schemes fail in the hardening: the temporary password must never be persisted outside the one-time display, a reset must kill sessions, and a clerk must not take over a teacher or owner. SMS OTP on unverified phones is an account-takeover vector.

**Settings and defaults:** identity.tempPassword.length = 10; identity.reset.maxPerActorPerDay = 40; identity.reset.maxPerTargetPer24h = 3; identity.selfServiceReset.enabled = false; identity.otp.ttlMinutes = 10; identity.otp.maxAttempts = 5; identity.otp.maxPerPhonePerDay = 3.

**Rejected:** Email invite or reset links (no email infrastructure); staff self-register then promote; temp password by SMS; SMS OTP at launch; returning the password through the idempotent flow.

**Reversibility:** Yes. Endpoints additive; OTP is a setting.

**Code impact:** user.service createStaff and resetPassword; mustChangePassword check in verifyToken and a route allow-list; issueTokenPair flag; User.mustChangePassword; idempotency middleware option to skip persisting the body; logger redact paths; staff-creation form and one-time display with print slip. Audit events PASSWORD_RESET_BY_STAFF, STAFF_ACCOUNT_CREATED, LOGIN_FAILED, PASSWORD_CHANGED. Size M. Tests: actor x target reset matrix, self refusal, ADMIN to TEACHER refusal, SUPER_ADMIN to SUPER_ADMIN refusal, token-claim restriction, no secret in audit.

### D-IDENTITY-8: Which identity fields each role can see

**Settles:** F-42, F-118, F-30, F-74, F-83, F-124

**Question:** What identity data does each role need and what must be hidden?

**Decision:** Field-level matrix enforced in the user service with separate select shapes per role (not UI hiding). SUPER_ADMIN: full record. ADMIN (front desk): name, index number, profile photo, own mobile, guardian name and mobile, enrolled classes, fee status, an 'is a minor' flag; NOT NIC, home address, date of birth, NIC photos, concession reasons. Search by name, index number or phone; NIC search SUPER_ADMIN only. A slim GET /users/lookup (id, name, indexNumber, profileImage, isMinor) serves the scanner and cash desk. TEACHER: the D-EXAMS-7 roster only (no phone, NIC, address, amounts). MARKER: index number only on scripts. STUDENT and guardian see their own data. No role other than SUPER_ADMIN reads guardian data beyond name and mobile. Full-record reads by SUPER_ADMIN, and any export, are audited.

**Rationale:** A clerk needs to recognise a child and phone a parent, not hold their NIC and address, the data most useful to someone copying a database. Teachers move between institutes, so phone numbers invite poaching. The API is the real boundary.

**Settings and defaults:** identity.adminCanSeeAddress = false; identity.adminCanSearchNic = false; identity.auditFullRecordReads = true (roster paid flag is roster.showPaidState).

**Wave 1 implementation of the teacher part (#116, unreleased):** `GET /classes/:id/roster` is the one place a teacher reads student identity, and it carries only the student's id, name and index number besides the fields of D-EXAMS-7.

**Rejected:** ADMIN sees everything; hide fields only in the frontend; teacher sees phone numbers.

**Reversibility:** Yes. Select shapes and settings; widening is easy.

**Code impact:** selectForRole(role) replaces userSelect; new lookup route, controller, schema; StaffScanner and CollectPayment switch to lookup; Vitest field-by-role matrix; pairs with F-09 scoping. Size S-M.

### D-IDENTITY-9: Retention, anonymisation and erasure

**Settles:** F-99

**Question:** How long is personal data kept and how does erasure or an access request work without breaking payments and the soft-delete invariant?

**Decision:** Retention is settings plus a daily BullMQ job, shipped REPORT_ONLY for the first run, then ENFORCE. Dormant student (no active enrollment and no payment for retention.dormantStudentMonths) is deactivated and listed for the owner retention.anonymiseNoticeDays before the scrub, then anonymised: name becomes 'Former student #<index>'; email, nic, phone, address, city, dateOfBirth, barcode, profileImage and any NIC photos are nulled or deleted from R2 (unique columns set NULL or a unique placeholder); guardian link removed and the Guardian row deleted if no other student uses it; password randomised; concession and request reason texts nulled. Rows that must survive stay: Payment, PaymentAdjustment (reason input carries a UI warning not to type names or phones; residual text in old rows is an accepted, documented exception), Attendance, Enrollment, marks. Financial rows are kept retention.financialRecordYears (confirm with the institute's accountant). Exam answer PDFs deleted retention.examScriptMonths after publish (marks kept). Payment-slip images deleted retention.slipImageMonths after approval or rejection (the record keeps its fields). RecordingView rows purged after retention.recordingViewDays. SmsLog bodies and phones masked after retention.smsLogDays; in-app Notification purged after retention.notificationDays; AuditLog rows kept retention.auditYears but IP and user agent nulled after retention.auditIpMonths (if an F-81 immutability trigger exists by then it must exempt exactly those two columns); IdempotencyRecord, expired RefreshToken and consumed OneTimeCode purged after 7 days. Documented exception to the CLAUDE.md invariants: anonymisation and purging of leaf log tables are the only places rows are rewritten or hard-deleted, and only inside this job and the erasure endpoint. Data-subject requests: DataSubjectRequest (organizationId, type ACCESS|ERASURE|CORRECTION, subjectUserId, requestedByNote, receivedAt, dueAt, completedAt, decisionNote). Erasure is SUPER_ADMIN-only POST /users/:id/erase with step-up, refused 409 while the student has an active enrollment or PENDING payment; for a minor it is accepted from the guardian on file after in-person identification. Access requests produce a SUPER_ADMIN-generated JSON or CSV export (no self-service in v1). Backups keep up to 6 months of dumps, so erased data ages out within that window; after any restore the erasure ledger and the anonymisation job must be re-run. Recordings are not deleted by an erasure request and follow D-STRUCTURE-6.

**Rationale:** Soft delete protects financial and audit integrity; identity lives only on User and everything else references ids, so anonymisation is compatible. Sri Lanka's Personal Data Protection Act No. 9 of 2022 expects data kept no longer than necessary, but periods and deadlines must be confirmed with counsel, so they are settings with conservative defaults. 24 months of dormancy fits an A/L cycle with repeaters. REPORT_ONLY first prevents an irreversible mass scrub from a bad query.

**Settings and defaults:** retention.dormantStudentMonths = 24; retention.anonymiseNoticeDays = 30; retention.financialRecordYears = 6 (confirm); retention.examScriptMonths = 12; retention.slipImageMonths = 18; retention.recordingViewDays = 180; retention.smsLogDays = 180; retention.notificationDays = 90; retention.auditYears = 6; retention.auditIpMonths = 12; retention.staffRecordYearsAfterExit = 6; retention.job.mode = REPORT_ONLY then ENFORCE; dsar.responseDays = 21 (confirm).

**Rejected:** Hard-delete users; keep everything forever; scrub payments with the user; email-only requests; self-service erasure button.

**Reversibility:** Periods reversible; each anonymisation is irreversible by nature, gated by REPORT_ONLY, the notice period and owner visibility.

**Code impact:** BullMQ retention job and anonymise service; DataSubjectRequest model with organizationId; erase and export endpoints; a migration that exempts ip and userAgent only if the F-81 trigger exists; R2 delete helper; Vitest: active-enrollment refusal, placeholder collisions, guardian shared by siblings, idempotent re-run, post-restore re-apply. Size M-L.

### D-IDENTITY-10: Lost card or phone, and verified contact changes

**Settles:** F-100, F-41, F-08, F-15

**Question:** What does the front desk do when a student loses a card or phone, and who may change contact numbers?

**Decision:** Front desk (ADMIN) or SUPER_ADMIN gets a 'Report lost card or phone' action on STUDENT accounts with a reason (LOST_CARD, LOST_PHONE, STOLEN, OTHER) and identity confirmation as in D-IDENTITY-7. It calls the single reissue endpoint of D-ACCESS-4: revokes all refresh tokens, issues a new random code (scheme owned by D-ACCESS-4), moves the old code to RetiredBarcode (barcode, userId, reason, retiredAt, organizationId), audits. The scanner and cash desk show a staff-only red 'Card reported lost, ask for ID' for a retired code instead of 'not found'; a replacement card is printed. A reissue fee is a counter matter (identity.cardReissueFee = 0, no ledger entry in v1). Phone numbers (student and guardian) are changed only by front desk or owner, in person or after calling the number on file, with an audit row and an SMS notice to the old number; students cannot self-edit phone; staff edits are validated with the Sri Lankan mobile regex and normalised to +94. Email changes stay self-service with password re-entry and the existing cooldown. No device limit.

**Rationale:** Cards and phones are lost monthly at this size and a static code is a proxy-attendance and fee-fraud risk. Shared family phones make a device cap lock out siblings. The phone is the future recovery factor and the guardian's channel, so unverified changes would let someone redirect a parent's SMS; at launch the front desk is the only trustworthy verifier.

**Settings and defaults:** identity.cardReissueFee = 0; identity.contactChange.byStaffOnly = true; identity.notifyOldPhoneOnChange = true; identity.deviceLimit = null. Revocation depends on F-15.

**Rejected:** Self-service lost-card button; device limit; derived code with a version suffix; OTP to the new phone now.

**Reversibility:** Yes. Additive table and endpoint; self-edit removal can be undone once OTP verification exists.

**Code impact:** user.service reportLost calling the D-ACCESS-4 reissue; RetiredBarcode model; resolver checks the retired list; profile.service and schema remove phone self-edit; staff phone-change endpoint with validation and notice SMS; lost-card dialog and scanner red state. Size S-M. Tests: retired code rejection, reissue revokes tokens, phone regex.

### D-IDENTITY-11: Teacher exit and content ownership (composition of other decisions)

**Settles:** F-101, F-82, F-107, F-91, F-97

**Question:** Who owns recordings, materials and exam banks and what happens to them when a teacher leaves?

**Decision:** The organization holds all content uploaded for its classes; the platform does not model individual teacher copyright, which is a contract matter the owner states in writing outside the system. On exit the owner runs a per-course choice enforced by the D-IDENTITY-6 guard: REASSIGN to another teacher (content stays), or END BATCH at an owner-chosen end date (D-STRUCTURE-6: students keep recording access for the alumni window, then it closes). The departing teacher's account is deactivated only after every course has a choice, their final statement is generated and exported when statements exist (D-MONEY-8), and deactivation revokes all access. The teacher's name stays on past content as instructor; the staff record is kept retention.staffRecordYearsAfterExit then anonymised by D-IDENTITY-9. A departing teacher cannot self-export recordings; materials and exam banks stay with the course. An owner exit checklist endpoint (courses, open exams, results to publish, sessions, final statement, revoke list) is generated by one call and mirrored in the runbook.

**Rationale:** Many teachers work for several institutes and take their following with them, so the owner needs a quick, clean rule: classes continue or end on the owner's terms and nobody keeps access after leaving, while students who paid for the month do not lose content mid-batch. Modelling copyright and export would invent rights nobody agreed.

**Settings and defaults:** identity.teacherExit.requireFinalStatement = true (applies once statements exist); identity.teacherExit.defaultCourseAction = END_BATCH; retention.staffRecordYearsAfterExit = 6; batch.alumniRecordingMonths (D-STRUCTURE-6) governs student access.

**Rejected:** Teacher-owned content with self-export; delete content on exit; leave the account active.

**Reversibility:** Yes. Defaults are settings; an ended batch can be reopened by SUPER_ADMIN while the retention window is open.

**Code impact:** Composition of D-IDENTITY-6, D-STRUCTURE-6 and D-STRUCTURE-9; GET /users/:id/exit-checklist; runbook. Size S-M beyond those.

### D-IDENTITY-12: Registration hardening and staff-assisted student registration

**Settles:** F-33, F-02, F-03

**Question:** How do we stop registration abuse and information leaks without blocking a whole class registering from one institute Wi-Fi?

**Decision:** Two paths. (1) Staff-assisted (default in a cash institute): front desk creates the student (POST /users/students) with name, date of birth, mobile or guardian mobile, optional email and school; the system issues an index number, a QR card and a temporary password printed on the registration slip (D-IDENTITY-7 rules), creates the guardian record and consent (WRITTEN_FORM or FRONT_DESK) and sets setupCompleted. (2) Self-registration (public site): requires date of birth and a mobile of the student or guardian in strict Sri Lankan form (normalised to +94); for a minor a guardian name and mobile plus the consent tick; NO NIC field at all (only SUPER_ADMIN may record one later). The response returns the minimal user shape. Registration responses stay minimal. Rate limits use their own bucket separate from login, per IP with a generous cap and per phone, so a class registering at one institute IP is not blocked while one phone cannot spawn many accounts. CAPTCHA (Turnstile) is optional and off by default. Staff search flags 'possible duplicate' for the same phone and a similar name; no automatic merge.

**Rationale:** Walk-ins who pay cash are the main path and the clerk must register someone in under a minute. Carrier NAT makes tight per-IP limits misfire. Removing NIC from registration removes a registration-time data exposure.

**Settings and defaults:** identity.register.perIpPerHour = 60; identity.register.perPhonePerDay = 5 (siblings share a phone); identity.register.captchaEnabled = false; identity.register.selfRegistrationEnabled = true; identity.register.requireMobile = true; identity.register.duplicateWarning = true.

**Rejected:** Self-registration only; email verification before login; strict 10 per minute per IP; block when the phone exists.

**Reversibility:** Yes. Settings or additive endpoints; self-registration can be switched off.

**Code impact:** auth.service register and schema (shared with D-IDENTITY-1, -2); staff registration controller, service, route; limiter configuration per route (with F-02 keying); registration and 'register student' screens with print slip and card. Size S-M. Vitest: age boundary, minor requires guardian, phone normalisation, duplicate warning, no NIC accepted.

### D-IDENTITY-13: Tenant export and restore tool

**Settles:** Doc 14 section 13 item 3, Doc 14 section 12 risk

**Question:** Is a per-organization export and restore tool required, and when?

**Decision:** Yes, as an operator CLI (not an API), required before a second organization is onboarded and not for the first launch (nightly backup plus a documented restore drill covers organization 1). npm run tenant:export -- --org <slug> writes a manifest (migration id, per-table counts and SHA-256, time, org id), one NDJSON file per tenant-owned table in foreign-key order derived from Prisma model metadata (new models included automatically), and the organization's R2 objects under the M5 prefix; Bunny videos as ids only. OrganizationIntegration credentials excluded unless --include-secrets, then encrypted. RefreshToken and IdempotencyRecord always excluded. npm run tenant:import -- --org-from <dir> --into <new-slug> restores into a new organization (ids mapped) or the same id on an empty database, refuses a non-empty target, supports --dry-run and runs scripts/check-tenant-integrity.ts at the end. Single-tenant point-in-time recovery restores the whole-database backup into a scratch database, exports from it, and replaces that tenant's rows only on owner approval. The same tool serves contract-end portability and offboarding (export, then purge after tenantOffboard.retentionDays). Export directories hold personal data: they are encrypted at rest, deleted after use, and after any import the D-IDENTITY-9 erasure ledger is re-applied. A Vitest test asserts the exporter's table list equals the tenant-integrity registry.

**Rationale:** A shared schema cannot restore one tenant from a dump without touching others; having no tool turns the first second-tenant incident into hand-edited SQL. A CLI avoids a new exfiltration surface. Not needed for launch with one tenant.

**Settings and defaults:** tenantExport.includeSecrets = false; tenantExport.compress = true; tenantOffboard.retentionDays = 90 (operator config); restore drill quarterly (doc 12).

**Rejected:** Database-per-tenant now; an HTTP export endpoint; rely on whole-database backups; build it before first launch.

**Reversibility:** Yes. Additive operational tooling.

**Code impact:** backend/src/scripts/tenant-export.ts and tenant-import.ts plus a shared table-order helper (4-6 days including the drill and registry-parity test); depends on M2-M5 for the object export; CI step exporting and re-importing a seeded organization.

### D-STRUCTURE-1: Branch model, parallel classes per branch and where a class meets

**Settles:** F-52, F-53, F-109

**Question:** Does one course run at several branches with separate rosters and fees, and can one branch host parallel classes?

**Decision:** A Course is one class at one place: own roster, fee, capacity and teacher, and at most ONE home branch (new nullable Course.instituteId; null means online-only). The same subject and teacher at two branches is two Courses with a branch suffix ('Physics 2027 Theory - NUG'). Enrollment carries no branch. Every ClassSession copies the branch from its course or slot into a new nullable ClassSession.instituteId (overridable per session). A PHYSICAL or HYBRID slot requires course.instituteId and the slot's institute must equal it; ONLINE slots have none. Parallel classes in one branch are an OPT-IN Room model (Room: instituteId, name, nullable capacity, isActive; SUPER_ADMIN only): when a slot has a roomId the branch-overlap conflict key becomes the room (course and teacher conflicts stay); a slot without a room conflicts with every slot at that branch as today, so a branch with zero rooms behaves unchanged. Students see branch name, city and room on the class page, class list, timetable and session rows. Deactivating an Institute is refused 409 with counts while active courses or slots reference it, and slot creation checks institute.isActive. A branch move for an enrolled student is a transfer between Courses (D-STRUCTURE-4).

**Rationale:** A class is teacher, subject, batch and medium meeting at one hall; at another branch it is a separate class with its own students, cash and often fee. Keying roster, fee, capacity, exam audience and markers by Course (already so) avoids threading a second dimension through payments and the gate. Rooms are opt-in because many branches have one hall.

**Settings and defaults:** No numeric parameters. Room.capacity is advisory (warn when course.capacity exceeds it, never block). Naming convention not enforced.

**Rejected:** Enrollment.instituteId (one course, several rosters); mandatory Room for every branch; dropping the branch conflict; rooms as the only conflict key.

**Reversibility:** Yes. All additions nullable; rooms can be ignored; a later enrollment-level branch is a data migration, not a rewrite.

**Code impact:** Course.instituteId, ClassSession.instituteId, Room (organizationId, index), TimetableSlot.roomId, ClassSession.roomId. Migration derives Course.instituteId when all slots share one institute and prints a report of courses spanning several. Services: class.service, timetable.service (assertNoConflict room key, slot institute matches course, generateSessions copies), institute and subject deactivation guards (F-109), attendance reads session.instituteId; room.service and routes; frontend location display and room picker. Size M. Tests: conflict matrix room vs no-room vs other branch, deactivation guard.

### D-STRUCTURE-2: Front-desk powers over scheduling and branch context at the scanner

**Settles:** F-105, F-37, F-116

**Question:** What may front desk do to timetables and sessions, and does front desk need to be tied to a branch?

**Decision:** Scheduling is a teacher and owner job. Remove ADMIN from slot create, update, delete and session generation (the five requireRole(SUPER_ADMIN, TEACHER, ADMIN) routes in timetable.routes.ts); ADMIN still cannot create a class. Front desk keeps read access and one scheduling power: cancel or restore a single session with a mandatory reason (D-STRUCTURE-8), org-wide, audit-logged, notifying the owning teacher in-app. Front desk is NOT hard-scoped to a branch in this phase: nullable User.homeInstituteId is only a default (scanner branch, collection branch, session filter), never a security boundary. The scanner lists today's sessions at the selected branch (including online sessions of courses homed there), records the branch in Attendance.instituteId, and keeps the reject-wrong-branch check now reading session.instituteId. Manual attendance gets the same branch check (F-116).

**Rationale:** The clerk collects cash and scans students; timetable editing is not a front-desk job. On a sick-teacher morning the person in the building is the front desk, so one audited cancel is the real need. Hard branch scoping pays only when each branch has its own staff that must not see the others; cash is already stamped with collectedAtInstituteId.

**Settings and defaults:** No numeric parameters. Future org setting staff.branchScoping (default off, not built) as the revisit trigger.

**Rejected:** Full User-to-Institute scoping now; leave ADMIN with timetable edit; remove ADMIN from cancelling.

**Reversibility:** Yes. Role lists are one-line changes; homeInstituteId nullable and advisory.

**Code impact:** timetable.routes.ts role lists; class-session service and routes add cancel and restore for ADMIN; user schema homeInstituteId plus update endpoint (SUPER_ADMIN sets it); attendance.service scan and manual share one branch assertion and record Attendance.instituteId; StaffScanner and CollectPayment default the branch. Size M. Vitest actor x action matrix.

### D-STRUCTURE-3: Class medium, kind, capacity, waitlist and who may enrol

**Settles:** F-92, R-STU-04

**Question:** What attributes tell one batch from another and how is hall capacity enforced?

**Decision:** Add to Course: medium (SINHALA, TAMIL, ENGLISH; required on create and edit, existing rows show 'medium not set' until filled), kind (THEORY, REVISION, PAPER, OTHER; default THEORY), nullable capacity (null = unlimited), acceptingEnrollments (default true). Capacity counts ACTIVE enrollments whose classType is PHYSICAL or HYBRID plus PHYSICAL trials (D-MONEY-7); ONLINE never uses a seat. A full class refuses new enrollments 409 CLASS_FULL, checked inside the enrollment transaction under a per-course advisory lock. Front desk and owner (not teachers or students) may override with overrideCapacity=true plus a reason, audited. Lowering capacity never evicts. Students self-enrol only while acceptingEnrollments is true and the class is not full; staff can enrol into a closed class (repeaters, late joiners). No waitlist in v1 ('Full - ask the front desk'). Stream is not a course attribute (it belongs to the student profile); name and year identify the cohort. Medium, kind, capacity and branch show on enroll and class pages and in the staff picker.

**Rationale:** Institutes run 'A/L Physics 2027 Theory (Sinhala)' and a separate Revision for the same students, and a hall has a physical limit; createEnrollment today only checks the course is active. Front desks squeeze in a late student with the teacher's blessing, so a reasoned override beats a hard wall. A waitlist needs hold windows and promotion rules.

**Settings and defaults:** capacity.overrideRequiresReason = true; Course.capacity default null.

**Rejected:** Waitlist with auto-promotion; counting ONLINE seats; a stream column; hard capacity with no override; restricting self-enrol by batch year.

**Reversibility:** Yes. Additive; capacity null disables the check.

**Code impact:** CourseMedium and CourseKind enums, four Course columns; class.schema and class.service; enrollment.service capacity count, lock, acceptingEnrollments for STUDENT, override with AuditService; frontend class form, EnrollPanel. Size M. Vitest: full class, last-seat race, override by ADMIN vs TEACHER vs STUDENT, lowered capacity, closed class student vs staff.

### D-STRUCTURE-4: Enrollment lifecycle: drop, transfer, rejoin (pause rejected)

**Settles:** F-93, F-65, F-10

**Question:** What happens to fee, roster and access when a student leaves, moves to another batch or comes back?

**Decision:** Enrollment.isActive stays the live flag; add Enrollment.activatedAt (D-MONEY-4; no separate enrolledFrom), endedOn, endReason (DROPPED, TRANSFERRED, BATCH_ENDED, NON_PAYMENT, STAFF_REMOVED), dropRequestedAt and an append-only EnrollmentEvent table (type, at, actorId, reason, Json detail). DROP: a student no longer drops directly; the button becomes 'Request to leave this class', setting dropRequestedAt, keeping access until staff confirm, listed for front desk. Staff (ADMIN or SUPER_ADMIN) end an enrollment with a reason and effective date (default today); the screen lists unpaid months since activatedAt for information only. A drop ends access and the seat immediately, never refunds automatically (owner-only refund path), the paid month is not carried. TRANSFER (staff only, the single cross-course transfer rule for the product): POST /enrollments/:id/transfer ends the source as TRANSFERRED and creates or reactivates the target in one Serializable transaction, checking capacity (staff override allowed); the current month's SUCCESS payment is re-pointed to the target, audited, ONLY when source and target have the same teacher, the same monthly fee and the same CourseTeacherShare percent for that month; otherwise the student pays the target and the owner may refund or override the source month. A transfer-in is not a joiner (no proration). Students cannot transfer themselves. PAUSE is not a state: a student who stops drops and later rejoins (existing reactivation path) with activatedAt reset, a REJOINED event, a capacity check and fee owed from the rejoin month. The unpaid-month report counts an enrollment for month M only if isActive and the month of activatedAt is not after M. NON_PAYMENT endings are never automatic: the who-owes list suggests enrollments unpaid for enrollment.nonPaymentSuggestMonths and staff end them in bulk.

**Rationale:** Mid-month leaving is routine; the institute norm is a monthly fee paid up front, so no automatic refund is conservative. Letting a minor erase an unpaid class from the owed list is a fee-evasion hole, and ending a child's place automatically for non-payment is worse. Moving a paid month between teachers would move income, so it follows the student only when teacher, fee and share are identical.

**Settings and defaults:** enrollment.studentDropNeedsApproval = true; enrollment.transferCarriesPaidMonth = SAME_TEACHER_FEE_SHARE (alt NEVER); enrollment.nonPaymentSuggestMonths = 2.

**Rejected:** EnrollmentPeriod rows; a PAUSED status; student self-service drop; automatic proration or refund on drop; always carrying the paid month; automatic non-payment removal.

**Reversibility:** Mostly. Additive columns and event table; settings; ended enrollments can be rejoined; a payment re-point is reversible by a second audited re-point.

**Code impact:** Do together with the HYBRID activeKey migration so uniqueness is rewritten once. Enrollment columns, EnrollmentEndReason enum, EnrollmentEvent model with organizationId; enrollment.service requestDrop, endEnrollment, transfer, rejoin; payment unpaid and outstanding use activatedAt; new routes POST /enrollments/:id/drop-request, /end, /transfer; EnrollPanel wording, 'Leaving requests' list, staff move dialog. Size M-L. Tests: actor x action x state, transfer same vs different teacher/fee/share, target already paid, capacity on transfer and rejoin, ended student loses access immediately.

### D-STRUCTURE-5: What 'deactivating a course' means: one archive rule

**Settles:** F-106, F-109

**Question:** What does Course.isActive = false mean and what may it do to students and money?

**Decision:** A course has three states from two fields: ACTIVE (isActive true, endedOn null), ENDED (isActive true, endedOn set, D-STRUCTURE-6) and ARCHIVED (isActive false). ARCHIVED means gone from the student world: hidden from every student list and detail, no sessions generated, excluded from every unpaid or due query, no live tokens, no recording streams, no new enrolments, no exam sittings. Enrollments and payments are untouched and ignored through the course.isActive filter, so un-archiving restores everything. Archive is allowed for SUPER_ADMIN and the owning TEACHER only when the course has no active enrollments or is ENDED; otherwise 409 COURSE_HAS_ACTIVE_ENROLLMENTS with the count (the fix is to end the batch first). Un-archive by SUPER_ADMIN and the owning TEACHER. Lists accept ?includeInactive=true for SUPER_ADMIN and the owning TEACHER ('Show archived'). Apply the rule everywhere missing: findActiveEnrollment and every enrollment select in access.service.ts, generateSessions, previewGeneration and sessionScope/slotScope in timetable.service.ts, live-class and video token paths, and payment due and outstanding queries (payment.service.ts joins Course but ignores c.isActive). Subjects and institutes follow the same guard: deactivation refused while active courses or slots reference them (409 with counts).

**Rationale:** Today inactive means five different things (detail 404 while sessions, modules, recordings and live tokens still work, the generator keeps creating sessions, and unpaid totals keep counting). One meaning, 'archived', is the simplest rule at the desk; blocking archive with students enrolled prevents a mis-click wiping a live class.

**Settings and defaults:** None.

**Rejected:** Cascade-disable slots and enrollments; keep serving content to an inactive course; archive with a force flag.

**Reversibility:** Yes. No data changes; flipping isActive restores access and generation.

**Code impact:** access.service, timetable.service, enrollment.service, live-class.service, video.service, payment report queries, class.service (list includeInactive, archive guard), subject and institute guards; one-time report of inactive courses that still have active enrollments; archived badge and toggle. Size M. Vitest: each gate path for student vs owner and own teacher.

### D-STRUCTURE-6: Batch end, year rollover, repeaters and recording retention

**Settles:** F-97, F-93

**Question:** How does a finished batch close, how is next year's batch created, how are repeaters handled and how long do past students keep recordings?

**Decision:** Course.year is the batch (usually the exam year), so nothing happens automatically in December. Three explicit actions by SUPER_ADMIN or the owning TEACHER. (1) END BATCH (POST /classes/:id/end, endedOn defaults to today): after a confirmation showing the active enrollment count, in one transaction set Course.endedOn and acceptingEnrollments=false; end every active enrollment as BATCH_ENDED with endedOn and recordingAccessUntil = endedOn + batch.alumniRecordingMonths; deactivate the slots; soft-cancel future sessions with reason 'Batch ended' (D-STRUCTURE-8). SUPER_ADMIN may reopen while the window is open (restores enrollments). (2) ROLLOVER (POST /classes/:id/rollover {year default year+1, name optional}): creates a new Course copying subject, teacher, fee (as the initial CourseFee row, allowed for the teacher because it is a new class), medium, kind, capacity, branch and description, copies slots as INACTIVE drafts for review, sets Course.rolledFromCourseId; copies no students, sessions, recordings, modules, materials, exams, payments or banner and backdrop R2 keys. (3) ALUMNI ACCESS: a student with a BATCH_ENDED enrollment may stream RECORDINGS of that course (not live, scan, exams or downloads) without payment until recordingAccessUntil, ignoring the 90-day and joiner floor of D-ACCESS-9; DROPPED, NON_PAYMENT and TRANSFERRED enrollments get none. Repeaters need no flag: the roster shows a derived 'Repeater' badge when the student has a BATCH_ENDED enrollment in the same subject of an earlier-year course; fee concessions are decided under D-MONEY-3. The owner dashboard lists ACTIVE courses whose year is before the current Asia/Colombo calendar year as 'batches to end'.

**Rationale:** A/L and O/L tuition runs per exam cohort across two calendar years, so a calendar job would end classes still running. Teachers value recordings as an asset next year's batch pays for, so free perpetual access undercuts them, yet students expect to rewatch around the exam; a bounded window is the compromise. Slots copied as drafts avoid sessions for an unreviewed batch; not copying banner keys avoids two courses owning one R2 object.

**Settings and defaults:** batch.alumniRecordingMonths = 3 (0 disables); batch.rolloverCopiesSlots = true (as inactive drafts).

**Rejected:** Automatic December rollover; cloning recordings by reference; perpetual free access; zero access after end; a stored repeater flag; alumni access for unpaid or dropped students.

**Reversibility:** Yes. Reopen restores a just-ended batch; the window is one setting; rollover only creates rows.

**Code impact:** Course.endedOn, rolledFromCourseId (self relation, Restrict), Enrollment.recordingAccessUntil; class.service endBatch, rollover, reopen (transactional, audited); timetable bulk deactivate and cancel; the alumni path inside assertStudentContentAccess/assertRecordingAccess (single function, shipped in the same change as D-ACCESS-9); roster repeater badge; owner dashboard query. Size M. Vitest: end-batch effects, alumni inside and outside the window, no live or scan for alumni, DROPPED none, rollover copies only allowed fields, teacher cannot end another's batch.

### D-STRUCTURE-7: Simulcast sessions and the default timetable mode

**Settles:** F-103, F-104

**Question:** How is a class held in the hall and streamed on Zoom at the same time represented and what should the timetable default mode be?

**Decision:** A simulcast lesson is ONE slot and ONE session. Interim: a session with classType null, relabelled 'In hall + live stream'. Target: when HYBRID ships the same meaning is classType HYBRID on slots and sessions and a migration maps null to HYBRID. One session means one hall, one Zoom meeting, one recording and one attendance record per student. Access follows the ENROLLMENT mode, not the session label: entrance scan accepts PHYSICAL and HYBRID enrollments, live join accepts ONLINE and HYBRID enrollments (a PHYSICAL-only student cannot use the stream unless onlineForPhysical). Keep same-course and same-teacher overlap rules strict; do NOT exempt ONLINE vs PHYSICAL overlaps. Wave 1 S fix for F-104: (a) live-class.service.ts schedules for classType null or ONLINE (reject only PHYSICAL); (b) the timetable form drops the empty 'All cohorts' default and requires one of 'In hall', 'Online only', 'In hall + live stream'; (c) the class page gets a session edit dialog for mode, date and duration. A simulcast session with no Zoom link yet is simply a hall class until the teacher schedules the stream.

**Rationale:** Sessions go live only when classType === ONLINE (live-class.service.ts) and the generator copies null for the default 'All cohorts', so default-created classes can never go online. Exempting overlaps would create two sessions per lesson (double attendance, recording attached to one) and the teacher is in one place anyway. The data model already documents null as 'all cohorts'.

**Settings and defaults:** timetable.generateAheadDays = 14 (moves from the constant TIMETABLE_GENERATE_AHEAD_DAYS into settings in the same change).

**Rejected:** Exempt ONLINE vs PHYSICAL overlaps; keep 'All cohorts' default with silent null going live; a third table for simulcast.

**Reversibility:** Yes. Interim is a conditional and a form; the null-to-HYBRID migration is a reversible relabel.

**Code impact:** S now, S later. live-class.service condition and message; TimetableManager options and required field; session edit dialog; later HYBRID enum migration with null backfill and eligibility per the HYBRID spec. Vitest: ONLINE, PHYSICAL, null schedule/deny; overlap still rejected; mode-based stream eligibility.

### D-STRUCTURE-8: Holiday, Poya and tuition-ban calendar and session cancellation

**Settles:** F-50, F-48, F-49, F-96

**Question:** How does the system know the institute is closed on a day and what does a cancelled class look like to students?

**Decision:** Add an organization-level ClosedDate table (startDate and endDate inclusive as Colombo dates, kind POYA, PUBLIC_HOLIDAY, EXAM_BAN, OTHER, reason, nullable instituteId where null means every branch and online), SUPER_ADMIN only, with a paste-a-list bulk add. Nothing is auto-computed or pre-seeded (a wrong built-in date would cancel real classes); the owner enters the year's dates. generateSessions and previewGeneration skip occurrences on an applicable ClosedDate (an ONLINE slot with no branch is affected only by organization-wide dates; EXAM_BAN covers online too) and preview reports CLOSED with the reason. Creating a ClosedDate also cancels already-generated sessions in range. Cancel is not delete: ClassSession.cancelledAt, cancelReason (required), cancelledById, closedDateId; a cancelled session stays visible to students as 'Cancelled - <reason>', is excluded from attendance, absence and fee logic, and is never regenerated. Soft delete (deletedAt) remains for mistaken sessions, owner-only. Who may cancel or restore one session: SUPER_ADMIN, the owning TEACHER (assertCourseAccess), front desk (D-STRUCTURE-2); restoring a ClosedDate-cancelled session needs SUPER_ADMIN; removing a ClosedDate restores its still-future sessions. Cancelling a session that starts within calendar.cancelSmsWithinHours sends one SESSION_CANCELLED notification to enrolled, mode-eligible students (exempt from quiet hours when the session starts within sms.urgentWithinHours; seeded per D-OPS-2); bulk closures further ahead do not SMS individually. Fees are unaffected: no automatic credit for a closure.

**Rationale:** Poya days, holidays and pre-exam tuition restrictions are certain each year and today each is a hand soft-delete with no reason, seen by students only as a vanished class. Owner-entered dates are the conservative choice. Verified: class-session.service.ts deleteSession only sets deletedAt; generateSessions has no calendar input.

**Settings and defaults:** calendar.cancelSmsWithinHours = 48; calendar.restoreSessionsOnClosedDateRemoval = true; timetable.generateAheadDays = 14. Per-class overrides deliberately absent.

**Rejected:** Built-in Poya calendar; per-course holiday lists; cancel by soft delete with no reason; SMS for every bulk closure; teachers overriding an exam-ban closure.

**Reversibility:** Yes. ClosedDate rows deletable, sessions restorable, new columns nullable.

**Code impact:** ClosedDate (organizationId, index); ClassSession cancel columns; NotificationType SESSION_CANCELLED; timetable.service generation and preview; class-session.service cancel and restore (replacing delete-on-cancel; student timetable includes cancelled sessions); closed-date service, controller, routes; attendance and reconciliation skip cancelled sessions; owner Calendar page and Cancelled badge. Size L. Vitest: generation skips by branch scope, closure cancels existing sessions, removal restores, permissions matrix, never regenerated, Colombo timezone edge.

### D-STRUCTURE-9: Teacher and marker hand-over mechanics and income dating

**Settles:** F-107, F-101, F-32, F-79

**Question:** What must happen to a teacher's or marker's classes and work, and to income attribution, when the account is deactivated or demoted?

**Decision:** The guard, matrix and request payload are owned by D-IDENTITY-6 (409 TEACHER_HAS_CLASSES, handover [{courseId, toTeacherId}] or handoverAllTo). This decision owns the mechanics. The hand-over runs in one transaction: Course.teacherId changes immediately (so assertCourseAccess, exams and marking follow at once), and the new teacher's timetable is checked for slot conflicts (409 listing them for the owner to resolve). Income follows the money, not the course: the hand-over adds a CourseTeacherShare row (D-MONEY-8) for the new teacher effective per handover.defaultEffectiveMonth (NEXT month; the owner may pick the current month with a reason when the teacher left early), so a payment's teacher is the one holding the share for that payment month and history is never rewritten (until D-MONEY-8 ships, no statement exists and the hand-over only changes teacherId; existing F-79 reports keep following the current teacher, flagged in the console). A MARKER with open assignments on unpublished or unfinalised exams is refused the same way, listing the assignments; reallocation uses the existing marker-allocation tools. Content ownership: recordings, materials and exam banks stay with the course (D-IDENTITY-11). The owner may park classes under a placeholder TEACHER such as 'Unassigned classes'. For teachers already deactivated with active courses, the generator skips their slots and an owner 'orphaned classes' list offers a one-click hand-over.

**Rationale:** Teachers leave mid-year, often to a competitor, and the student relationship and recordings are the institute's asset; a deactivation leaving classes owned by a dead account while still billing students is the worst outcome. Dating income ownership by the share table avoids a second table and protects the departed teacher's earned history.

**Settings and defaults:** handover.defaultEffectiveMonth = NEXT (alt CURRENT).

**Rejected:** Auto-reassign to the owner (SUPER_ADMIN is not a TEACHER); warning only; delete content; immediate income cut-over; a separate CourseTeacherPeriod table.

**Reversibility:** Yes. A hand-over is undone by another; share rows are append-only history.

**Code impact:** user.service transactional hand-over and marker check; class.service reassign helper; timetable skips slots of deactivated teachers; orphaned-classes query and page; CourseTeacherShare write when D-MONEY-8 exists. Size M. Vitest: ADMIN 403, owner with and without handover, no-course teacher, conflicting target timetable, marker with open assignments, attribution across the cut-over month.

### D-STRUCTURE-10: Delivery order summary (authoritative detail: section 4)

**Settles:** doc 14 section 11 ordering, doc 17 section 7 waves, HYBRID spec section 5

**Question:** In what order do the tenancy steps, HYBRID, the bank slip, local drivers and the fix waves ship?

**Decision:** Wave 0 now (no tenancy prerequisite). Then the settings table and org-time helper (small, tenant-ready from M1) open Wave 1 (the advisory-lock helper already landed in Wave 0), which also carries the S-sized structure fixes (F-104, F-106, F-109, F-107 guard) and the local video driver. Tenancy M2 and M3 run as one focused stretch after Wave 1, during which only hotfixes merge and no feature adds tables. Wave 2 order: (a) one enrollment migration (HYBRID, activeKey, activatedAt, nextClassType, trialUntil, endedOn/endReason, recordingAccessUntil, ClassSession.onlineForPhysical, EnrollmentEvent; the single Attendance migration already shipped in Wave 1 Task 8); (b) money core and the single content gate (computeMonthFee, REVERSAL, coverage function, mode rule, exams, recordings window); (c) structure (course attributes and capacity, branch and rooms, archive, calendar, end-batch and rollover, substitutes, Zoom concurrency); (d) bank slip after (b) and the Wave 1 cash visibility fixes; (e) guardian, SMS events, retention, teacher money authority and statements. M4-M7 are deferred until a second organization is contracted and gated by the tenant export tool and a combined-capacity load test. Until then CLAUDE.md rules continue: every new model carries organizationId, the relation and an index; no new global uniques on user-visible values; no hand-built R2 or Redis keys; no new provider-credential reads from env.

**Rationale:** Blast radius first; Wave 1 removes daily dead ends for a live institute; M2-M3 before Wave 2 because Wave 2 is where most new tables and uniques arrive and writing them once on the scoped client is cheaper than retrofitting; HYBRID and the lifecycle share one migration because both rewrite Enrollment uniqueness; the slip channel waits for reconciliation views; M4-M7 have no benefit before a second tenant. D-EXAMS-2 does not need M2 because it adds no table, a deliberate departure from doc 14's physical-result-slice ordering.

**Settings and defaults:** Triggers, not numbers: M4-M7 start when a second organization is signed; M2-M3 start after Wave 1 completes (the earliest acceptable cut-over is Wave 0 plus F-11, F-10, F-83 and F-67, or earlier if a second customer signs first). Suggested M2-M3 freeze one to two weeks; if longer, merge M2 per service group.

**Rejected:** M2-M7 before any fixes; never doing M2-M3 until a customer appears; HYBRID and slip before the gate rework; slip in Wave 1; interleaving M2 with Wave 1 feature PRs.

**Reversibility:** Yes, it is a plan. Irreversible points: the M3 NOT NULL migration and the HYBRID enrollment merge, each gated by a refuse-to-run check.

**Code impact:** None directly. Shared item: OrganizationSetting and registry (D-MONEY-10), built once in the opening step of Wave 1 and reused by all clusters.

### D-OPS-1: Who-owes list, end-of-day cash tally and bulk-upload guard

**Settles:** F-10, F-58, F-77

**Question:** How does the owner see who owes, whether the day's cash adds up, and how is bulk marking of payments controlled?

**Decision:** WHO OWES: a list for ADMIN and SUPER_ADMIN by branch, course and month (enrolled students with no SUCCESS row, excluding trials, with the amount from computeMonthFee), showing name, index number, guardian phone and months owed up to fees.arrearsReportMonths; CSV export SUPER_ADMIN only and audited. Wave 1 uses the existing fee and swaps to computeMonthFee when D-MONEY-2 lands. REMINDERS: a manual 'send fee reminder' per course or selection sends a FEE_DUE SMS to the guardian (minor) or student per D-IDENTITY-3, at most fees.reminderMaxPerStudentPerMonth (1), only from day fees.reminderFromDay (after the grace window, default 11), never in quiet hours; automatic reminders are off (fees.autoReminderEnabled = false). The FEE_DUE type is seeded disabled until the owner enables it. CASH TALLY: Payment already carries collector, branch and amount; add filters (collector, branch, date range) and a group-by endpoint, and a daily CashTally record per collector and branch (countedAmount typed by the clerk at close, systemAmount computed from CASH payments that collector recorded that Colombo day, variance, note). A non-zero variance is flagged to the owner console; the tally is a record, not a lock (a later payment reopens that day's system amount); the owner marks it reconciled. BULK UPLOAD: restricted to SUPER_ADMIN (migration and recovery tool); ADMIN collects one by one. It requires an active enrollment, a month not later than current plus fees.advanceMonthsAllowed, an amount equal to computeMonthFee, a collector stamp, a per-row audit row, one transaction, a dry-run preview and a row cap.

**Rationale:** The audit found the only aggregate of unpaid is hidden from front desk and short-collection is invisible; the owner needs to see who owes and whether cash matches. Exporting minors' phone numbers is a leak vector, so export is owner-only. Bulk upload and desk collection need tighter guards.

**Settings and defaults:** fees.reminderFromDay = 11; fees.reminderMaxPerStudentPerMonth = 1; fees.autoReminderEnabled = false; tally.varianceFlagAmount = 0 (any difference); tally.enabled = true; bulk.maxRows = 300.

**Wave 1 implementation of who owes and reminders (#111, unreleased):** `GET /payments/outstanding`, `/outstanding/export` (owner only, audited) and `POST /payments/outstanding/reminders` are live; the financial report's outstanding figure uses the same filter (F-78: deactivated students and archived courses no longer count, any month works). The guardian phone is the student's own mobile until D-IDENTITY-2, and the branch filter waits for `Course.instituteId`. `FEE_DUE` seeds SMS off (`NOTIFICATION_SMS_DEFAULTS`, enforced by the compiler for every new type); the in-app row is always created, which is also the record the monthly cap is counted from. **Not enforced yet:** SMS quiet hours (21:00-07:00), because the SMS settings that define them arrive later; the SMS channel stays off until the owner enables it after a trial week. The cash tally and bulk-upload guard of this decision ship in the next two Wave 1 PRs.

**Wave 1 implementation of the cash tally (#112, unreleased):** `Payment.collectedAt` (the instant staff took the money; desk cash before the column was backfilled from `updatedAt`) and the `CashTally` table (one row per collector, Colombo day and branch, counted amount, system amount, variance, note, reconciled by and when). `GET /payments/cash` is the group-by, `GET /payments/cash-tally` the counted days, `POST /payments/cash-tally` the clerk's close (an update when repeated), `PATCH /payments/cash-tally/:id/reconcile` the owner's mark. System amount = that collector's `ENTRANCE` payments (`SUCCESS` or `REFUNDED`) of that Colombo day and branch; a branch-less group is its own row. Variance beyond `tally.varianceFlagAmount` (0 means any difference) is flagged; a later payment makes the row `staleSinceClose` instead of locking the day. A reconciled day cannot be counted again, which keeps what the owner checked from changing underneath. `ADMIN` counts and reads only their own cash; `SUPER_ADMIN` reads everyone and may filter by collector, branch and range. `tally.enabled = false` rejects counts with `409 TALLY_DISABLED` and hides the screens' count controls. The same change makes `collect-entrance` refuse any existing `SUCCESS` row with `409 ALREADY_PAID` (the any-SUCCESS rule of D-MONEY-2 pulled forward). **Not built:** a printable end-of-day slip, the owner-console panel (F-127).

**Wave 1 implementation of the bulk-upload guard (#113, unreleased):** `POST /payments/bulk-upload` is `SUPER_ADMIN` only (the front-desk role is removed from the route and refused again in the service). The owner checks a file with `?dryRun=true`, which writes nothing, then applies it; the file is all or nothing. Each row must name an active enrollment of an active course and a non-deactivated student of the caller's organization, a month up to `fees.advanceMonthsAllowed` ahead (default 1; past months stay open for recovery) and, if it carries an amount, exactly the course fee; a month that already has a `SUCCESS` payment is never overwritten and a refunded one stays immutable. `bulk.maxRows` (default 300) replaces the old hard-coded 5,000. Applied rows are stamped with the owner as `collectedById` and written with one `PAYMENT_BULK_ROW_APPLIED` audit row each plus one `PAYMENT_BULK_UPLOAD` summary, inside the same transaction. Bulk rows are not desk cash (`collectedAt` stays empty), so they never enter the end-of-day count. Reading the file moved to `utils/bulk-payment-rows.ts`, the row rules to `utils/bulk-payment-plan.ts`, and the service to `payment-bulk.service.ts`; error row numbers now match the spreadsheet even when blank rows sit between data rows.

**Rejected:** Automatic reminders at launch; front-desk CSV export; a hard cash-close lock; leaving bulk upload with ADMIN.

**Reversibility:** Yes. Additive queries, a table and a role change.

**Code impact:** payment.service outstanding as TypeScript over active enrollments; filter and group-by endpoints; CashTally model (organizationId, index); bulk-upload guards and role change; UI columns and tally screen; owner console panels. Size M. Tests: who-owes excludes trials and archived courses, ADMIN cannot export, variance flagged, bulk guards.

### D-OPS-2: Notification events, schedulers and defaults

**Settles:** F-72, F-76, F-75

**Question:** Which events send messages, to whom, when, and which are on by default?

**Decision:** Event catalogue (recipients per D-IDENTITY-3): PAYMENT_CONFIRMED (exists); FEE_CHANGED; FEE_DUE (manual, D-OPS-1); REFUND and PAYMENT_OVERRIDDEN (money, guardian); ABSENCE; SESSION_CANCELLED and SESSION_RESCHEDULED; EXAM_SCHEDULED and EXAM_REMINDER (student, in-app plus SMS only if enabled); EXAM_EXTENSION_GRANTED; RESULTS_PUBLISHED (no marks) and RESULTS_UPDATED; RESULT_CORRECTED (affected student); MARKING_ASSIGNED (in-app to the marker only, never SMS); PAYMENT_REQUEST_DECIDED and ACCESS_EXCEPTION (in-app to staff); GUARDIAN_NOTICE. Every event always creates an in-app notification (free); SMS is per type and per organization. Seeds: SMS enabled for PAYMENT_CONFIRMED, FEE_CHANGED, GUARDIAN_NOTICE; all other new SMS types disabled until the owner enables them after a trial week, in the suggested order SESSION_CANCELLED, ABSENCE, FEE_DUE, results types; existing types RESULTS_PUBLISHED and PAYMENT_OVERRIDDEN keep their current setting. ABSENCE rule: a BullMQ job runs notifications.absenceDelayMinutes after a session ends and sends one SMS per absent student per day only if the session has at least one scan row (a session nobody scanned never mass-texts parents), the student has an active enrollment whose mode includes the session channel, the row is not EXCUSED, PARTIAL or voided, and for online sessions after the reconcile completed; held to 07:00 if inside quiet hours; mode notifications.absenceMode = EVERY_ABSENCE (alt AFTER_N_CONSECUTIVE). Exam reminders are one scheduled job a day before the exam. All schedulers use BullMQ only.

**Rationale:** Only three events exist and no schedulers; the owner needs a defined catalogue and a safe rollout so cost and parents' trust are controlled. In-app is free, SMS is the reach channel and the cost.

**Settings and defaults:** notifications.absenceDelayMinutes = 120; notifications.absenceMode = EVERY_ABSENCE; notifications.examReminderHoursBefore = 24; per-type SMS enable flags in NotificationSetting; budget and quiet hours per D-IDENTITY-3.

**Rejected:** All SMS types on at launch; SMS for marker assignment; absence SMS for unscanned sessions; per-user notification preferences.

**Reversibility:** Fully. Per-type switches and settings.

**Code impact:** New NotificationType values and seed rows; absence job and exam-reminder job in the worker; remove sendResultsSms; recipientsFor extended. Size L (mostly jobs and tests). Tests: absence rules matrix, unscanned session sends nothing, EXCUSED and voided skipped, quiet-hours hold, disabled type sends in-app only.

### D-OPS-3: Student-centric entrance scanning

**Settles:** F-114, F-37, F-43

**Question:** With several classes starting at the same time, how does the scanner know which session to credit?

**Decision:** The scan resolves the STUDENT first. With a branch selected (default User.homeInstituteId), the system finds the student's active enrollments whose sessions at that branch have an open scan window today: exactly one open session is credited automatically; more than one (a student enrolled in two classes at the same hour) shows a short picker limited to that student's own sessions; none shows 'Not enrolled in any class open here' with the Enroll link and writes nothing. The clerk may still choose a session manually (the D-ACCESS-3 picker), in which case a student not enrolled in it is recorded with a NOT_ENROLLED warning as before. Auto mode is the default; manual mode is a toggle. All other rules (warnings, window, snapshots) are D-ACCESS-3.

**Rationale:** Session-centric scanning forces the clerk to pick a session by hand and credits everyone to it, which is wrong when parallel classes start together (now possible with rooms, D-STRUCTURE-1).

**Settings and defaults:** attendance.scan.autoMode = true.

**Rejected:** Session-centric only; guessing across branches; auto-writing a row for a student with no session.

**Reversibility:** Yes. A toggle.

**Code impact:** scanBarcode accepts instituteId and optional sessionId; resolve sessions by enrollment, window and branch; scanner UI picker and toggle. Size M. Tests: one, two and zero matching sessions, manual override, other branch.

### D-OPS-4: Zoom licence concurrency

**Settles:** F-56

**Question:** With one Zoom licence, how many live classes may run at once and what happens on overlap?

**Decision:** zoom.maxConcurrentMeetings defaults to 1 (the number of licensed hosts the organization has bought). Scheduling a live session whose time, plus zoom.bufferMinutes before and after, overlaps live sessions beyond that cap is refused 409 ZOOM_CAPACITY listing the clashing sessions, at schedule time (when the Zoom meeting is created) and for substitutes (D-EXAMS-10). Creating timetable slots that could go live only WARNS (they may never be streamed). The owner raises the setting when more licences are bought; a second account per organization belongs to M4 provider credentials. Concurrency is counted across the organization, not per teacher.

**Rationale:** One licence means one live class at a time; discovering it when a teacher cannot start a meeting is worse than being told when scheduling.

**Settings and defaults:** zoom.maxConcurrentMeetings = 1; zoom.bufferMinutes = 15.

**Rejected:** No check; blocking at slot creation; per-teacher accounts now.

**Reversibility:** Yes. A setting.

**Code impact:** live-class.service schedule-time overlap query over live sessions; timetable warning; settings keys. Size S. Tests: overlap at cap, buffer, cap 2.

## 3. Conflicts found and how each was resolved

1. SETTINGS STORE (D-MONEY-10, D-ACCESS-1, D-EXAMS-11, D-IDENTITY-1, D-STRUCTURE-10): three different designs (OrganizationSetting table x4, Organization.settings Json plus a 60 s Redis cache in D-EXAMS-11). Resolved: ONE OrganizationSetting table owned by D-MONEY-10 (typed Zod registry, SUPER_ADMIN-only audited edits, read per request with request-scoped memo). D-EXAMS-11 loses the Json column and the Redis cache (hand-built Redis keys are forbidden before M5 and the API must stay stateless). All other clusters register keys, never new stores. Key convention domain.leafName.
2. GRACE / COVERAGE DUPLICATION (D-ACCESS-1 isStudentCovered vs D-MONEY-1 coverage function; access.paymentGraceDays vs feeGraceDays): two helpers and two keys for the same rule. Resolved: one function (isStudentCovered, built in D-ACCESS-1 as the plumbing, rules owned by D-MONEY-1) and one key fees.graceDays=10. Every other decision calls it; none re-derives paid.
3. RECORDING ELIGIBILITY (D-MONEY-1 backfill 1 month rolling, D-ACCESS-9 90-day window and joiner month, D-STRUCTURE-6 alumni window, D-IDENTITY-11 departedTeacherContentMonths 12, D-ACCESS-9 afterEnrollmentDays): four overlapping rule sets. Resolved: one assertRecordingAccess composed of role gate (D-ACCESS-8), coverage (D-MONEY-1), mode, then ONE window rule: session date >= first day of the month of Enrollment.createdAt minus recordings.joinerBackfillMonths (default 0, the conservative of 0 and 1 because a half-fee late joiner must not get two months) AND session date within recordings.viewWindowDays (90). Alumni (BATCH_ENDED) is the only post-enrollment access, via D-STRUCTURE-6, and ignores the 90-day and joiner floor so a finished batch can revise everything until recordingAccessUntil. recordings.afterEnrollmentDays and retention.departedTeacherContentMonths are removed.
4. ENROLLMENT HISTORY COLUMNS (D-MONEY-4 Enrollment.activatedAt vs D-STRUCTURE-4 enrolledFrom, both reset on rejoin; D-STRUCTURE-4 EnrollmentPeriod-like events): duplicate fields. Resolved: one column activatedAt (D-MONEY-4), plus D-STRUCTURE-4's endedOn, endReason, dropRequestedAt and EnrollmentEvent; enrolledFrom dropped. Recording floor uses createdAt (first-ever activation, which reactivation preserves).
5. TRANSFER (D-MONEY-4 says cross-course transfer unsupported and a paid month never moves; D-STRUCTURE-4 transfers between batches and carries the paid month; D-STRUCTURE-1 makes each branch a separate Course so a branch move IS a cross-course move). Resolved in favour of D-STRUCTURE-4's staff-only transfer, with the carry rule tightened to same teacher AND same fee AND same CourseTeacherShare percent for that month; a transfer-in is not a joiner (no proration); otherwise the student pays the target and the owner may refund the source.
6. ARCHIVE vs ARCHIVED (D-IDENTITY-11 ARCHIVE keeps current students watching; D-STRUCTURE-5 ARCHIVED hides the course from students and is refused while students are enrolled). Resolved: teacher exit per course is REASSIGN or END BATCH (D-STRUCTURE-6, owner-chosen end date, alumni window applies); ARCHIVED stays the D-STRUCTURE-5 meaning.
7. TEACHER HAND-OVER (D-IDENTITY-6, D-STRUCTURE-9, D-IDENTITY-11 each define the guard, payload and exit flow; D-STRUCTURE-9 CourseTeacherPeriod duplicates D-MONEY-8 CourseTeacherShare). Resolved: D-IDENTITY-6 owns the guard, the matrix and the payload (handover list, 409 TEACHER_HAS_CLASSES); D-STRUCTURE-9 owns timetable-conflict check, marker rule and orphaned list; income dating uses CourseTeacherShare rows (no CourseTeacherPeriod table); D-IDENTITY-11 is only the exit checklist composed from the others.
8. ATTENDANCE MODEL (D-ACCESS-5 adds status PRESENT/LATE/PARTIAL/EXCUSED, front desk marks within 24 h; D-EXAMS-8 says LATE and EXCUSED are not introduced, adds void columns, 72 h window for front desk and teacher). Resolved: one Attendance migration with all columns (status, markedById, voidedAt/By/Reason, snapshots, instituteId, durationSeconds, source VIDEO) and one recordAttendance writer. Windows: teacher PRESENT/LATE mark and void 72 h (attendance.correctionWindowHours), front desk mark and void 24 h (attendance.frontDeskWindowHours), teacher EXCUSED up to 14 days (attendance.excuseWindowDays) so a late illness report still works, owner unrestricted. Voided rows excluded everywhere.
9. EXCUSED CATCH-UP vs PHYSICAL-ONLY RULE (D-ACCESS-9): opening a recording to a PHYSICAL student after an excused absence is a back door into the 2026-11-19 decision. Resolved: recordings.excusedCatchUpDays ships at 0 (off); it is an optional owner extension, not part of the decided rule, kept separate from the EXCUSED status itself.
10. PROVISIONAL SLIP ACCESS (D-MONEY-6 and D-MONEY-1): unverified image unlocks content for 48 h, contradicting the decided 'staff-approved' bank-slip channel and the spec sentence that a pending slip does not unlock content. Resolved: slips.provisionalAccessHours ships at 0 (strict spec). If an owner enables it, it covers live and streaming only (never downloads) and only enrollments that paid the previous month. Grace (D-MONEY-1) already covers the common honest late depositor.
11. BACKDATING (D-MONEY-3 concessionBackdateMonths=0 vs D-MONEY-9 waiverMaxMonthsBack=1). Resolved: waiver of one unpaid previous month is the single permitted backdated form, only for a month with no SUCCESS row, and a teacher-requested waiver of a past month is never auto-approved (always owner queue).
12. GUARDIAN NOTICE SMS (D-IDENTITY-2 enabled by default vs D-IDENTITY-3 every new SMS type seeded disabled). Resolved: only GUARDIAN_NOTICE and FEE_CHANGED seed enabled (consent and fee-notice SMS are worthless if undelivered; both are rare); all other new types seed disabled, in-app always on. Also D-MONEY-2's 'SMS on fee save' becomes FEE_CHANGED routed as a MONEY event to the guardian.
13. QUIET HOURS vs SESSION_CANCELLED (D-IDENTITY-3 holds SMS 21:00-07:00; D-STRUCTURE-8 cancel SMS the evening before a morning class would arrive after it starts). Resolved: SESSION_CANCELLED and RESCHEDULED are exempt when the session starts within sms.urgentWithinHours (12).
14. SETUP GATE (D-IDENTITY-1 requireSetupCompleted on payment-initiate): a parent could not pay a fee online because a profile is incomplete. Resolved: guard applies to enroll, live and recording tokens and exam sitting, never to payment initiation.
15. REGISTRATION NIC (D-IDENTITY-12 keeps NIC optional at registration; D-IDENTITY-1 says NIC never requested from minors; D-IDENTITY-8 hides NIC from front desk). Resolved: self-registration no longer accepts NIC at all; only SUPER_ADMIN may record one later; the global unique stays until M3 and a clash is shown to the owner only.
16. PASSWORD RESET OF A CO-OWNER (D-IDENTITY-7 lets SUPER_ADMIN reset any non-self account; D-IDENTITY-5 makes owner recovery CLI-only). Resolved: SUPER_ADMIN may reset every non-SUPER_ADMIN, non-self account; SUPER_ADMIN targets via CLI only, so a compromised owner session cannot take over the second owner.
17. SCAN CARD REISSUE (D-ACCESS-4 reissue action and random code with no prefix; D-IDENTITY-10 lost-card action and code prefixed with organization code). Resolved: D-ACCESS-4 owns scheme (random 10-char Crockford, no prefix, uniqueness per organization in the resolver and later (organizationId, code)) and the single reissue endpoint; D-IDENTITY-10 owns the lost-card workflow, reason codes, RetiredBarcode, staff-only red state and phone-change rules.
18. SCAN MODEL (D-ACCESS-3 session-centric picker vs F-114 student-centric need). Resolved: new D-OPS-3: auto mode resolves the student first to their own open sessions at the selected branch; manual session pick stays as fallback.
19. ROSTER PAID FLAG (D-EXAMS-7 'same as gate' would show students in grace as paid or flip with trials; duplicate keys roster.showPaidState and identity.teacherRosterShowsPaidFlag). Resolved: roster state is PAID (current-month SUCCESS incl. free-card zero rows) / NOT_PAID / TRIAL, deliberately not grace-aware; one key roster.showPaidState.
20. HALL-MARK PREVIEW vs MARKER ANONYMITY (D-EXAMS-2 dry run returns names to markers; D-IDENTITY-8 gives markers index numbers only). Resolved: names in the preview only for TEACHER and SUPER_ADMIN.
21. EXISTING-DUPLICATE ENROLLMENTS (D-MONEY-1 'any active enrollment has coverage'): a paid PHYSICAL enrollment could unlock an unpaid ONLINE enrollment's live access. Resolved: a channel is allowed only if some single active enrollment both permits that channel and is covered.
22. SMS COST EVENTS NOT COUNTED (new SMS from money, identity and structure clusters; no event list for F-72/F-76 existed): resolved by new D-OPS-2 owning the event catalogue, schedulers and defaults; D-IDENTITY-3 keeps recipients, languages, quiet hours and budget.
23. CAPACITY vs TRIAL (D-STRUCTURE-3 counts PHYSICAL/HYBRID seats; D-MONEY-7 trial PHYSICAL enrollment): resolved, a PHYSICAL trial counts toward capacity while it lasts.
24. ORDERING CONFLICT (D-STRUCTURE-10 places OrganizationSetting in Wave 2a after M2-M3, D-ACCESS-3 and D-OPS items need settings in Wave 1; D-MONEY-10 puts it first): resolved in the sequencing below, the settings table and org-time helper land first in Wave 1, before the M2-M3 freeze.
25. LEGACY-ONLY RISKS NOT COVERED: F-56 (single Zoom licence), F-77/F-10/F-58 (cash tally, who owes, bulk upload), F-114 (student-centric scan) and F-88 (lock reason in recording list) had no decision. Added D-OPS-1, D-OPS-3, D-OPS-4 and F-88 text in D-ACCESS-9.
26. RETENTION GAPS (new tables holding student data: RecordingView, PaymentSlip images, concession and request reasons, OneTimeCode): not in D-IDENTITY-9. Resolved there: retention.recordingViewDays, retention.slipImageMonths, reasons nulled on anonymisation and visible only to owner and the requesting teacher.
27. DOC 17 SECTION 12 'assistant delegate with cash handover' vs D-EXAMS-9 'no assistant, no teacher cash': kept D-EXAMS-9 (consistent with the three decided channels and the largest fraud surface); recorded as a deliberate departure from the section 12 proposal, not a reopening of any 2026-11-19 decision.
28. DOC 14 ORDERING (land M1-M3 before the physical-result slice F-13): D-EXAMS-2 adds no new table (only columns on Submission), so it does not need M2; kept in Wave 1 as D-STRUCTURE-10 argued.

## 4. Delivery sequencing

WAVE 0 (now; no tenancy prerequisite; blast radius first because it closes live exposure and touches the same services M2 later rewrites, keeping both diffs small): F-01 session lifetime; D-ACCESS-8 recording stream, metadata and list restricted to student, owning teacher and owner (F-04, F-06); F-09 attendance read scoping; F-54 Zoom webhook hardening; F-55 production boot check; F-02 SSR traffic out of the per-IP limiter; D-ACCESS-4 slice (single resolver, collision report, write-time uniqueness for new codes; no new QR scheme yet); D-IDENTITY-5 owner-account safety (the seed script made create-only). The advisory-lock helper is created in Wave 0 (scan-code uniqueness needs it) and reused by the Wave 1 foundations; the owner-cap setting and API step-up of D-IDENTITY-5 arrive in Wave 1 once the settings registry exists.

WAVE 1 (give each role a working day; a live institute with 1,200 students and no second customer gets daily dead ends removed before isolation nobody can yet exploit):

Step 1, foundations, because every later item reads numbers or the clock: OrganizationSetting plus registry, org-timezone helper (fixes the UTC month bug), withAdvisoryLock helper, isStudentCovered in its simple form (D-MONEY-10, D-ACCESS-1); F-15 per-request user lookup and tokenVersion (prerequisite for every deactivation and reissue rule, which are only as fast as revocation); the local video driver behind the existing interface (so recording and RecordingView work can be tested end to end offline, and M4 later wraps the same interface instead of redoing it; refused in production per doc 16).

Step 2, identity safety: D-IDENTITY-6 guard and handover payload, D-IDENTITY-7 staff creation and staff-assisted reset (F-03, F-21), D-IDENTITY-12 staff-assisted registration, D-IDENTITY-1 stop NIC collection and purge REPORT_ONLY, F-29 server gate (not on payment), D-IDENTITY-4 delete Permission, D-IDENTITY-8 field-level reads, D-IDENTITY-10 lost-card workflow with the D-ACCESS-4 random scheme and reissue endpoint.

Step 3, the single Attendance migration (all columns once) then D-ACCESS-5 writer, D-ACCESS-3 scan policy with D-OPS-3 student-centric auto mode, D-EXAMS-8 teacher marking and void, D-STRUCTURE-2 front-desk powers.

Step 4, teacher and money visibility: D-EXAMS-1 (F-67), D-EXAMS-2 (F-13), D-EXAMS-3 (F-17, F-22), D-EXAMS-7 roster (F-83), D-OPS-1 who-owes, cash tally and bulk guard (F-10, F-77, F-58; before the bank slip because slips add a new way to create money records and the owner needs reconciliation first), D-STRUCTURE-7 (F-104), D-STRUCTURE-5 and the F-109 guards, F-127 read-only owner console growing panel by panel (open reversals, request queue, concession expiry, orphaned classes, batches to end, leaving requests, retention report, SMS budget, who owes, cash).

M2 AND M3 (one focused one-to-two-week stretch after Wave 1; only hotfixes merge, no feature adds tables, because Wave 2 is where nearly all new tables and uniques arrive and writing them once on the scoped client with per-organization uniques is cheaper than retrofitting; M1 already guarantees organizationId on every new table).

WAVE 2:

2a, ONE enrollment migration (HYBRID enum, activeKey, activatedAt, nextClassType, trialUntil, endedOn, endReason, dropRequestedAt, recordingAccessUntil, ClassSession.onlineForPhysical, EnrollmentEvent), because HYBRID and the lifecycle both rewrite Enrollment uniqueness and must do it once;

2b, money core and the single content gate: computeMonthFee and CourseFee with the any-SUCCESS guard and fixed amount (D-MONEY-2, first because concessions, proration, slips and per-mode PayHere amounts all call it), REVERSAL and chargeback handler (D-MONEY-5, independent and closes a real leak), coverage function with AccessException and the PHYSICAL-only mode rule (D-MONEY-1, F-05, F-23, F-65; the mode and payment rules live in the same function as the recording and alumni windows, so D-ACCESS-9, D-ACCESS-2 and D-ACCESS-8 completion ship in the same change), then proration and mode change (D-MONEY-4), trials and advance month (D-MONEY-7), concessions with the fee-month-roll job (D-MONEY-3);

2c, structure: Course attributes and capacity (D-STRUCTURE-3), branch and rooms (D-STRUCTURE-1), enrollment lifecycle features (D-STRUCTURE-4), calendar and cancellation (D-STRUCTURE-8), end-batch and rollover (D-STRUCTURE-6, after the content gate because alumni access is part of it), substitutes (D-EXAMS-10), Zoom concurrency (D-OPS-4);

2d, the bank-slip channel (PaymentSlip, D-MONEY-6) after 2b and the Wave 1 cash visibility fixes;

2e, identity and communication: guardian, date of birth and consent (D-IDENTITY-2), SMS recipients, languages and budget (D-IDENTITY-3) then the event catalogue and schedulers (D-OPS-2; guardian data must exist before guardian fan-out and sendResultsSms must already be removed), live attendance reconcile and recording attendance with RecordingView (D-ACCESS-6, D-ACCESS-7; need eligibility by mode from 2a and the Attendance migration), exam publish, late work and ranks (D-EXAMS-4, -5, -6), retention and erasure (D-IDENTITY-9, REPORT_ONLY first), teacher exit checklist (D-IDENTITY-11);

2f, teacher money authority then shares and statements (D-MONEY-9 then D-MONEY-8; requests need concessions and the fee function, shares are also the dated income record that D-STRUCTURE-9 writes on a hand-over). Local SMS driver and the doc 16 drivers are already in place and the video driver landed in Wave 1.

M4-M7 (provider credentials, key spaces, isolation suite, host routing) wait until a second organization is contracted and are gated by the tenant export and restore tool (D-IDENTITY-13) and the combined-capacity load test; the random-QR switch-off of the legacy code format and the PHYSICAL-only decisions are unaffected by M4-M7. Standing rules throughout: every new table carries organizationId, the relation and an index; no new global uniques on user-visible values; no hand-built R2 or Redis keys (sole exception: the dev-only clock driver's local-driver:clock-offset-ms key, refused in production, Wave 1b Task 3); no provider-credential reads from env; every guard ships with an actor-by-target Vitest matrix.

## 5. What still needs the owner (values, not design)

These are inputs only the owner can supply. Enter them in the settings screens or on an operator terminal; never commit them to this repository.

1. Per-course teacher share percentages (the system applies no default).
2. The real organization name and code (doc 14 placeholders, `DEF`), bank details for the slip channel, the front-desk phone for the guardian notice SMS, and the year's Poya, public-holiday and exam-ban dates.
3. A native Sinhala and Tamil speaker to proofread the SMS templates before those languages go live per type.
4. Retention periods confirmed with the institute's accountant and counsel (Sri Lanka PDPA No. 9 of 2022, age and consent wording for minors, response deadline), and the number of Zoom licences (`zoom.maxConcurrentMeetings`).
5. The owner enables SMS types after a one-week trial and raises the teacher money caps (shipped at zero) when ready.

### Operator checks (not owner decisions)

- The object-storage key has delete permission before the NIC photo purge runs.
- `Payment.amount` has no CHECK greater than zero before zero-amount free-card rows are written.
- Zoom participant-report fields are verified on a staging account.

### Notes

- Public-repo rule: documentation updates contain no real bank details, phone numbers, owner identifiers, collision-report output, purge output or credentials; those live in `OrganizationSetting` or on operator terminals.
- Every advisory lock (D-ACCESS-4, D-IDENTITY-5, D-STRUCTURE-3) uses the one `withAdvisoryLock(namespace, organizationId, key)` helper, to avoid hash collisions.
- The F-127 owner console is read-only and not an owner decision; the decisions above list the panels it must carry.
- D-OPS-1 to D-OPS-4 cover owner-flagged findings that had no decision (F-10, F-58, F-77, F-72, F-76, F-114, F-56); F-88 is inside D-ACCESS-9 and F-79 inside D-MONEY-8 and D-STRUCTURE-9.

## 6. Infrastructure and scope calls recorded here

**P-TOPO: production is same-origin `/api`.** The server-rendered `(app)` layout reads the auth cookies on the Next server. Those cookies are host-only (no `domain`), so they reach the Next server only when the browser talks to one host: nginx routing `/` to the frontend and `/api` to the backend, or a Vercel rewrite of `/api` to the VPS with `NEXT_PUBLIC_API_URL=/api`. The split variant described in [09-cost-and-hosting.md](09-cost-and-hosting.md) (frontend at `<domain>`, API at `api.<domain>`, absolute API URL) cannot work with the server-side guard, so it is not a supported production shape. The Wave 0 plan corrects doc 09, the nginx and Compose comments in its first PR and adds a one-line deploy check. **Verify this against the real production deployment before the first release that contains the session fix.**

**Departures from earlier proposals (inside the delegation, none reopening 2026-11-19).**
- Doc 17 section 12 proposed an assistant who takes cash on a teacher's behalf. D-EXAMS-9 rejects it: it adds the largest fraud surface and is not one of the three decided payment channels.
- Three safety valves that touch the decided rules ship **off**: `slips.provisionalAccessHours = 0`, `recordings.excusedCatchUpDays = 0`, and teacher money caps at zero.
- **Teacher money authority ships at zero caps.** A teacher can ask for a concession, waiver or refund and the owner approves from a queue (D-MONEY-9); raising a teacher's caps in settings lets that teacher approve up to the cap directly, and refunds are never auto-approved. This meets the request that teachers have more control over their own work without letting cash move unreviewed on day one.
- The F-01 fix approach was revised in the Wave 0 plan: the first option in the original audit recommendation was found unsafe, so doc 18 and the plan now describe the safer one.

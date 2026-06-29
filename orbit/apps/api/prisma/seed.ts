/**
 * Dev seed with rich mock data so every screen is populated.
 * Idempotent for users/ROs (upsert). Submissions seed only when the table is
 * empty, so re-running won't duplicate them.
 *
 * Run: npm run seed -w @orbit/api
 */
import {
  PaymentType,
  PrismaClient,
  RequestType,
  Role,
  SubmissionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? './uploads');
// 1x1 transparent PNG.
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function writePlaceholder(submissionId: string, when: Date): Promise<string> {
  const year = String(when.getFullYear());
  const month = String(when.getMonth() + 1).padStart(2, '0');
  const rel = join(year, month, submissionId, `${randomUUID()}-proof.png`)
    .split('\\')
    .join('/');
  const abs = join(UPLOAD_DIR, rel);
  await fs.mkdir(dirname(abs), { recursive: true });
  await fs.writeFile(abs, PLACEHOLDER_PNG);
  return rel;
}

function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 15, 0, 0);
  return d;
}

interface HistoryStep {
  from: SubmissionStatus | null;
  to: SubmissionStatus;
  by: string; // user id
  reason?: string;
  at: Date;
}

async function createSubmission(opts: {
  id?: string;
  roId: string;
  roName: string;
  submittedById: string;
  requestType: RequestType;
  paymentType: PaymentType;
  paymentTypeNote?: string;
  amount: string;
  paymentDate: Date;
  bankName: string;
  referenceNumber: string;
  notes?: string;
  status: SubmissionStatus;
  version?: number;
  parentId?: string;
  createdAt: Date;
  history: HistoryStep[];
  notify?: { userId: string; type: string; title: string; body: string; at: Date }[];
}) {
  const id = opts.id ?? randomUUID();
  const path = await writePlaceholder(id, opts.createdAt);

  await prisma.paymentSubmission.create({
    data: {
      id,
      roId: opts.roId,
      submittedById: opts.submittedById,
      requestType: opts.requestType,
      paymentType: opts.paymentType,
      paymentTypeNote: opts.paymentTypeNote ?? null,
      amount: opts.amount,
      paymentDate: opts.paymentDate,
      bankName: opts.bankName,
      referenceNumber: opts.referenceNumber,
      notes: opts.notes ?? null,
      attachmentPath: path,
      attachmentOriginalName: 'proof.png',
      attachmentMimeType: 'image/png',
      status: opts.status,
      version: opts.version ?? 1,
      parentId: opts.parentId ?? null,
      createdAt: opts.createdAt,
      updatedAt: opts.history[opts.history.length - 1]?.at ?? opts.createdAt,
    },
  });

  for (const h of opts.history) {
    await prisma.submissionStatusHistory.create({
      data: {
        submissionId: id,
        fromStatus: h.from,
        toStatus: h.to,
        changedById: h.by,
        reason: h.reason ?? null,
        createdAt: h.at,
      },
    });
  }

  for (const n of opts.notify ?? []) {
    await prisma.notification.create({
      data: {
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        submissionId: id,
        createdAt: n.at,
      },
    });
  }

  return id;
}

async function main() {
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10);
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // --- users & ROs --------------------------------------------------------
  const superAdmin = await prisma.user.upsert({
    where: { email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@orbit.irbas.com' },
    update: {},
    create: {
      email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@orbit.irbas.com',
      fullName: process.env.SEED_SUPER_ADMIN_NAME ?? 'Orbit Super Admin',
      role: Role.SUPER_ADMIN,
      isActive: true,
      passwordHash,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'review@orbit.irbas.com' },
    update: {},
    create: {
      email: 'review@orbit.irbas.com',
      fullName: 'Ayesha Khan (Head Office)',
      role: Role.ADMIN,
      isActive: true,
      passwordHash,
      createdById: superAdmin.id,
    },
  });

  // System user that owns submissions ingested by the n8n workflow. It cannot
  // log in (no password, inactive). Its id goes into WORKFLOW_BOT_USER_ID.
  const workflowBot = await prisma.user.upsert({
    where: { email: 'workflow-bot@orbit.irbas.com' },
    update: {},
    create: {
      email: 'workflow-bot@orbit.irbas.com',
      fullName: 'Workflow Bot',
      role: Role.RO_USER,
      isActive: false,
      createdById: superAdmin.id,
    },
  });

  // whatsappGroupId mirrors the n8n mock-data group ids (group_<city>_001) so
  // the existing mock scripts resolve to the right office out of the box.
  const roDefs = [
    { code: 'RO-LHR-01', name: 'Lahore Regional Office', city: 'Lahore', region: 'Punjab', whatsappGroupId: 'group_lahore_001' },
    { code: 'RO-KHI-01', name: 'Karachi Regional Office', city: 'Karachi', region: 'Sindh', whatsappGroupId: 'group_karachi_001' },
    { code: 'RO-ISB-01', name: 'Islamabad Regional Office', city: 'Islamabad', region: 'Capital', whatsappGroupId: 'group_islamabad_001' },
  ];
  const ros: Record<string, { id: string; name: string }> = {};
  for (const def of roDefs) {
    const ro = await prisma.regionalOffice.upsert({
      where: { code: def.code },
      update: { whatsappGroupId: def.whatsappGroupId },
      create: def,
    });
    ros[def.code] = { id: ro.id, name: ro.name };
  }

  const roUserDefs = [
    { email: 'ro.lahore@orbit.irbas.com', name: 'Bilal Ahmed', code: 'RO-LHR-01' },
    { email: 'ro.lahore2@orbit.irbas.com', name: 'Sana Tariq', code: 'RO-LHR-01' },
    { email: 'ro.karachi@orbit.irbas.com', name: 'Imran Sheikh', code: 'RO-KHI-01' },
    { email: 'ro.islamabad@orbit.irbas.com', name: 'Hassan Raza', code: 'RO-ISB-01' },
  ];
  const roUsers: Record<string, string> = {};
  for (const def of roUserDefs) {
    const u = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: {
        email: def.email,
        fullName: def.name,
        role: Role.RO_USER,
        roId: ros[def.code].id,
        isActive: true,
        passwordHash,
        createdById: superAdmin.id,
      },
    });
    roUsers[def.email] = u.id;
  }

  // A pending RO user who hasn't activated (shows the "setup pending" state).
  await prisma.user.upsert({
    where: { email: 'ro.pending@orbit.irbas.com' },
    update: {},
    create: {
      email: 'ro.pending@orbit.irbas.com',
      fullName: 'Pending Activation User',
      role: Role.RO_USER,
      roId: ros['RO-KHI-01'].id,
      isActive: false,
      createdById: superAdmin.id,
    },
  });

  console.log('✓ Users & ROs ready');
  console.log(`\n⚙  Workflow Bot user id (set WORKFLOW_BOT_USER_ID in .env):\n   ${workflowBot.id}\n`);

  // --- submissions (only if empty) ----------------------------------------
  const existing = await prisma.paymentSubmission.count();
  if (existing > 0) {
    console.log(`✓ Submissions already present (${existing}), skipping mock data`);
    return;
  }

  const lhr = roUsers['ro.lahore@orbit.irbas.com'];
  const lhr2 = roUsers['ro.lahore2@orbit.irbas.com'];
  const khi = roUsers['ro.karachi@orbit.irbas.com'];
  const isb = roUsers['ro.islamabad@orbit.irbas.com'];

  // 1. Approved (Lahore) — full happy path
  await createSubmission({
    roId: ros['RO-LHR-01'].id,
    roName: ros['RO-LHR-01'].name,
    submittedById: lhr,
    requestType: RequestType.DEPOSIT,
    paymentType: PaymentType.BANK_TRANSFER,
    amount: '152000.00',
    paymentDate: daysAgo(6),
    bankName: 'HBL',
    referenceNumber: 'TRX-889201',
    notes: 'Payment from D.Watson against June invoice.',
    status: SubmissionStatus.APPROVED,
    createdAt: daysAgo(6),
    history: [
      { from: null, to: SubmissionStatus.SUBMITTED, by: lhr, at: daysAgo(6) },
      { from: SubmissionStatus.SUBMITTED, to: SubmissionStatus.UNDER_REVIEW, by: admin.id, at: daysAgo(5, 11) },
      { from: SubmissionStatus.UNDER_REVIEW, to: SubmissionStatus.APPROVED, by: admin.id, at: daysAgo(5, 14) },
    ],
    notify: [
      { userId: lhr, type: 'STATUS_CHANGED', title: 'Payment request approved', body: 'Your request for PKR 152,000.00 has been approved', at: daysAgo(5, 14) },
    ],
  });

  // 2. Submitted / pending (Karachi)
  await createSubmission({
    roId: ros['RO-KHI-01'].id,
    roName: ros['RO-KHI-01'].name,
    submittedById: khi,
    requestType: RequestType.DEPOSIT,
    paymentType: PaymentType.CASH_DEPOSIT,
    amount: '87500.50',
    paymentDate: daysAgo(1),
    bankName: 'Meezan Bank',
    referenceNumber: 'DEP-44120',
    status: SubmissionStatus.SUBMITTED,
    createdAt: daysAgo(1),
    history: [{ from: null, to: SubmissionStatus.SUBMITTED, by: khi, at: daysAgo(1) }],
    notify: [
      { userId: admin.id, type: 'SUBMISSION_RECEIVED', title: 'New payment request submitted', body: 'Karachi Regional Office submitted a CASH DEPOSIT request of PKR 87,500.50', at: daysAgo(1) },
      { userId: superAdmin.id, type: 'SUBMISSION_RECEIVED', title: 'New payment request submitted', body: 'Karachi Regional Office submitted a CASH DEPOSIT request of PKR 87,500.50', at: daysAgo(1) },
    ],
  });

  // 3. Under review (Islamabad)
  await createSubmission({
    roId: ros['RO-ISB-01'].id,
    roName: ros['RO-ISB-01'].name,
    submittedById: isb,
    requestType: RequestType.VENDOR_PAYMENT,
    paymentType: PaymentType.CHEQUE,
    amount: '240000.00',
    paymentDate: daysAgo(3),
    bankName: 'UBL',
    referenceNumber: 'CHQ-771209',
    notes: 'Cheque from Imtiaz Super Market.',
    status: SubmissionStatus.UNDER_REVIEW,
    createdAt: daysAgo(3),
    history: [
      { from: null, to: SubmissionStatus.SUBMITTED, by: isb, at: daysAgo(3) },
      { from: SubmissionStatus.SUBMITTED, to: SubmissionStatus.UNDER_REVIEW, by: admin.id, at: daysAgo(2, 9) },
    ],
    notify: [
      { userId: isb, type: 'STATUS_CHANGED', title: 'Your request is under review', body: 'Your request is being reviewed by the team', at: daysAgo(2, 9) },
    ],
  });

  // 4. Rejected → Resubmitted (Lahore) — the full lifecycle chain
  const rejectedV1 = await createSubmission({
    roId: ros['RO-LHR-01'].id,
    roName: ros['RO-LHR-01'].name,
    submittedById: lhr2,
    requestType: RequestType.EXPENSE,
    paymentType: PaymentType.BANK_TRANSFER,
    amount: '63000.00',
    paymentDate: daysAgo(9),
    bankName: 'Bank Alfalah',
    referenceNumber: 'TRX-100455',
    notes: 'Transfer screenshot.',
    status: SubmissionStatus.REJECTED,
    version: 1,
    createdAt: daysAgo(9),
    history: [
      { from: null, to: SubmissionStatus.SUBMITTED, by: lhr2, at: daysAgo(9) },
      { from: SubmissionStatus.SUBMITTED, to: SubmissionStatus.UNDER_REVIEW, by: admin.id, at: daysAgo(8, 11) },
      { from: SubmissionStatus.UNDER_REVIEW, to: SubmissionStatus.REJECTED, by: admin.id, reason: 'Amount does not match the bank statement. Please re-upload the correct slip.', at: daysAgo(8, 12) },
    ],
    notify: [
      { userId: lhr2, type: 'PROOF_REJECTED', title: 'Payment request rejected', body: 'Your request was rejected. Tap to view the reason and resubmit', at: daysAgo(8, 12) },
    ],
  });

  await createSubmission({
    roId: ros['RO-LHR-01'].id,
    roName: ros['RO-LHR-01'].name,
    submittedById: lhr2,
    requestType: RequestType.EXPENSE,
    paymentType: PaymentType.BANK_TRANSFER,
    amount: '68500.00',
    paymentDate: daysAgo(7),
    bankName: 'Bank Alfalah',
    referenceNumber: 'TRX-100455-B',
    notes: 'Corrected slip with matching amount.',
    status: SubmissionStatus.APPROVED,
    version: 2,
    parentId: rejectedV1,
    createdAt: daysAgo(7),
    history: [
      { from: null, to: SubmissionStatus.SUBMITTED, by: lhr2, at: daysAgo(7) },
      { from: SubmissionStatus.SUBMITTED, to: SubmissionStatus.UNDER_REVIEW, by: admin.id, at: daysAgo(6, 16) },
      { from: SubmissionStatus.UNDER_REVIEW, to: SubmissionStatus.APPROVED, by: admin.id, at: daysAgo(6, 17) },
    ],
    notify: [
      { userId: admin.id, type: 'PROOF_RESUBMITTED', title: 'Request resubmitted', body: 'Lahore Regional Office has resubmitted a request', at: daysAgo(7) },
      { userId: lhr2, type: 'STATUS_CHANGED', title: 'Payment request approved', body: 'Your request for PKR 68,500.00 has been approved', at: daysAgo(6, 17) },
    ],
  });

  // 5. Other type (Karachi)
  await createSubmission({
    roId: ros['RO-KHI-01'].id,
    roName: ros['RO-KHI-01'].name,
    submittedById: khi,
    requestType: RequestType.SALARY_DISBURSEMENT,
    paymentType: PaymentType.OTHER,
    paymentTypeNote: 'Direct online transfer via app',
    amount: '19999.99',
    paymentDate: daysAgo(2),
    bankName: 'JS Bank',
    referenceNumber: 'OTH-55012',
    status: SubmissionStatus.SUBMITTED,
    createdAt: daysAgo(2),
    history: [{ from: null, to: SubmissionStatus.SUBMITTED, by: khi, at: daysAgo(2) }],
    notify: [
      { userId: admin.id, type: 'SUBMISSION_RECEIVED', title: 'New payment request submitted', body: 'Karachi Regional Office submitted an OTHER request of PKR 19,999.99', at: daysAgo(2) },
    ],
  });

  // --- ledger adjustments (admin-created charges/credits) ------------------
  await prisma.ledgerAdjustment.createMany({
    data: [
      {
        roId: ros['RO-LHR-01'].id,
        type: 'DEBIT',
        amount: '250000.00',
        description: 'Stock delivered — KEUNE June consignment (to be paid back after sale)',
        effectiveDate: daysAgo(11),
        createdById: admin.id,
      },
      {
        roId: ros['RO-KHI-01'].id,
        type: 'DEBIT',
        amount: '180000.00',
        description: 'Stock delivered — KEUNE consignment',
        effectiveDate: daysAgo(9),
        createdById: admin.id,
      },
      {
        roId: ros['RO-LHR-01'].id,
        type: 'CREDIT',
        amount: '40000.00',
        description: 'Opening balance adjustment',
        effectiveDate: daysAgo(13),
        createdById: superAdmin.id,
      },
    ],
  });

  const count = await prisma.paymentSubmission.count();
  console.log(`✓ Seeded ${count} submissions with history & notifications`);
  console.log('✓ Seeded ledger adjustments (stock deliveries & a credit)');
  console.log('\nLogin (all passwords = ' + password + '):');
  console.log('  Super Admin : admin@orbit.irbas.com');
  console.log('  Admin       : review@orbit.irbas.com');
  console.log('  RO (Lahore) : ro.lahore@orbit.irbas.com / ro.lahore2@orbit.irbas.com');
  console.log('  RO (Karachi): ro.karachi@orbit.irbas.com');
  console.log('  RO (Isb)    : ro.islamabad@orbit.irbas.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

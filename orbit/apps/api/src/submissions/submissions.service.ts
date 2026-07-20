import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PaymentType,
  Prisma,
  RequestType,
  Role,
  SubmissionStatus,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { buildPaginatedMeta } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/types/auth-user';
import { STORAGE_SERVICE, StorageService } from '../files/storage/storage.interface';
import {
  NotificationEvents,
} from '../notifications/notification-events';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { QuerySubmissionsDto } from './dto/query-submissions.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import {
  serializeSubmission,
  SUBMISSION_INCLUDE,
} from './submissions.serializer';

/** Allowed status transitions (spec §10.2). */
const TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  SUBMITTED: [
    SubmissionStatus.UNDER_REVIEW,
    SubmissionStatus.APPROVED,
    SubmissionStatus.REJECTED,
  ],
  UNDER_REVIEW: [SubmissionStatus.APPROVED, SubmissionStatus.REJECTED],
  APPROVED: [],
  REJECTED: [],
};

const SORTABLE = new Set([
  'createdAt',
  'paymentDate',
  'amount',
  'status',
]);

/**
 * Ledger classification (spec/client rule):
 *  - DEPOSIT → CREDIT (money in: bank transfer / cheque / deposit slip)
 *  - EXPENSE, SALARY_DISBURSEMENT, VENDOR_PAYMENT, OTHER → DEBIT (money out)
 * The balance counts only APPROVED submissions (verified source of truth),
 * keyed by the month of the actual payment date.
 */
const CREDIT_TYPES = new Set<RequestType>([RequestType.DEPOSIT]);

export interface MonthlyBalance {
  credited: string;
  debited: string;
  net: string;
  byType: Record<string, string>;
}

function emptyBalance(): MonthlyBalance {
  return { credited: '0.00', debited: '0.00', net: '0.00', byType: {} };
}

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private isAdmin(user: AuthUser): boolean {
    return user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
  }

  // --- create ---------------------------------------------------------------

  async create(
    user: AuthUser,
    dto: CreateSubmissionDto,
    file?: Express.Multer.File,
  ) {
    if (!user.roId) {
      throw new ForbiddenException('Only RO users can submit requests');
    }
    if (!file) throw new BadRequestException('An attachment is required');

    if (dto.paymentType === PaymentType.OTHER && !dto.paymentTypeNote?.trim()) {
      throw new BadRequestException(
        'A payment type note is required when type is Other',
      );
    }

    const paymentDate = new Date(dto.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('Invalid payment date');
    }
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (paymentDate > today) {
      throw new BadRequestException('Payment date cannot be in the future');
    }

    const ro = await this.prisma.regionalOffice.findUnique({
      where: { id: user.roId },
    });
    if (!ro || !ro.isActive) {
      throw new BadRequestException('Your regional office is inactive');
    }

    const id = uuidv4();
    const saved = await this.storage.save(file, id);

    const submission = await this.prisma.paymentSubmission.create({
      data: {
        id,
        roId: user.roId,
        submittedById: user.sub,
        requestType: dto.requestType,
        paymentType: dto.paymentType,
        paymentTypeNote: dto.paymentTypeNote ?? null,
        amount: new Prisma.Decimal(dto.amount),
        paymentDate,
        bankName: dto.bankName,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes ?? null,
        attachmentPath: saved.path,
        attachmentOriginalName: saved.originalName,
        attachmentMimeType: saved.mimeType,
        status: SubmissionStatus.SUBMITTED,
        version: 1,
      },
      include: SUBMISSION_INCLUDE,
    });

    await this.prisma.submissionStatusHistory.create({
      data: {
        submissionId: id,
        fromStatus: null,
        toStatus: SubmissionStatus.SUBMITTED,
        changedById: user.sub,
      },
    });

    this.events.emit(NotificationEvents.SUBMISSION_CREATED, {
      submission,
      roName: ro.name,
    });

    return serializeSubmission(submission, this.storage);
  }

  // --- list -----------------------------------------------------------------

  async list(user: AuthUser, query: QuerySubmissionsDto) {
    const where: Prisma.PaymentSubmissionWhereInput = {};

    if (!this.isAdmin(user)) {
      where.roId = user.roId ?? '__none__';
    } else if (query.roId?.length) {
      where.roId = { in: query.roId };
    }

    if (query.status?.length) where.status = { in: query.status };
    if (query.paymentType) where.paymentType = query.paymentType;
    if (query.dateFrom || query.dateTo) {
      where.paymentDate = {};
      if (query.dateFrom) where.paymentDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.paymentDate.lte = new Date(query.dateTo);
    }
    if (query.search) {
      where.OR = [
        { referenceNumber: { contains: query.search, mode: 'insensitive' } },
        { bankName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const sortBy = SORTABLE.has(query.sortBy ?? '') ? query.sortBy! : 'createdAt';
    const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.paymentSubmission.count({ where }),
      this.prisma.paymentSubmission.findMany({
        where,
        include: SUBMISSION_INCLUDE,
        orderBy: { [sortBy]: sortDir },
        skip: query.skip,
        take: query.limit,
      }),
    ]);

    return {
      data: rows.map((r) => serializeSubmission(r, this.storage)),
      meta: buildPaginatedMeta(total, query.page, query.limit),
    };
  }

  // --- detail ---------------------------------------------------------------

  async findOne(user: AuthUser, id: string) {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (!this.isAdmin(user) && submission.roId !== user.roId) {
      throw new ForbiddenException('You cannot access this submission');
    }
    return serializeSubmission(submission, this.storage);
  }

  // --- status transition (admin) -------------------------------------------

  async updateStatus(user: AuthUser, id: string, dto: UpdateStatusDto) {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const allowed = TRANSITIONS[submission.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move from ${submission.status} to ${dto.status}`,
      );
    }

    // Workflow-originated requests may arrive without a confirmed amount; an
    // admin must set one (see updateDetails) before the request can be approved.
    if (dto.status === SubmissionStatus.APPROVED && submission.amount === null) {
      throw new BadRequestException(
        'Set a confirmed amount before approving this request',
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.paymentSubmission.update({
        where: { id },
        data: { status: dto.status },
        include: SUBMISSION_INCLUDE,
      }),
      this.prisma.submissionStatusHistory.create({
        data: {
          submissionId: id,
          fromStatus: submission.status,
          toStatus: dto.status,
          changedById: user.sub,
          reason: dto.status === SubmissionStatus.REJECTED ? dto.reason : null,
        },
      }),
    ]);

    this.events.emit(NotificationEvents.STATUS_CHANGED, {
      submission: updated,
      fromStatus: submission.status,
      toStatus: dto.status,
      reason: dto.reason,
    });

    return serializeSubmission(updated, this.storage);
  }

  // --- admin edit (confirm extracted fields before approval) ----------------

  /**
   * Admin-only edit of the financial fields. Used to confirm/correct values the
   * workflow extracted (amount, request type, payment method) before approving a
   * workflow-originated request. Not allowed once the request is terminal.
   */
  async updateDetails(user: AuthUser, id: string, dto: UpdateSubmissionDto) {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (
      submission.status === SubmissionStatus.APPROVED ||
      submission.status === SubmissionStatus.REJECTED
    ) {
      throw new BadRequestException('Cannot edit a finalized request');
    }

    const data: Prisma.PaymentSubmissionUpdateInput = {};
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.requestType !== undefined) data.requestType = dto.requestType;
    if (dto.paymentType !== undefined) data.paymentType = dto.paymentType;
    if (dto.paymentTypeNote !== undefined) data.paymentTypeNote = dto.paymentTypeNote;
    if (dto.bankName !== undefined) data.bankName = dto.bankName;
    if (dto.referenceNumber !== undefined) data.referenceNumber = dto.referenceNumber;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() ? dto.notes : null;
    if (dto.paymentDate !== undefined) {
      const pd = new Date(dto.paymentDate);
      if (Number.isNaN(pd.getTime())) {
        throw new BadRequestException('Invalid payment date');
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (pd > today) {
        throw new BadRequestException('Payment date cannot be in the future');
      }
      data.paymentDate = pd;
    }

    if (
      (data.paymentType === PaymentType.OTHER || submission.paymentType === PaymentType.OTHER) &&
      data.paymentType === PaymentType.OTHER &&
      !String(data.paymentTypeNote ?? submission.paymentTypeNote ?? '').trim()
    ) {
      throw new BadRequestException(
        'A payment type note is required when type is Other',
      );
    }

    const updated = await this.prisma.paymentSubmission.update({
      where: { id },
      data,
      include: SUBMISSION_INCLUDE,
    });
    return serializeSubmission(updated, this.storage);
  }

  // --- resubmit (RO) --------------------------------------------------------

  async resubmit(
    user: AuthUser,
    originalId: string,
    dto: CreateSubmissionDto,
    file?: Express.Multer.File,
  ) {
    const original = await this.prisma.paymentSubmission.findUnique({
      where: { id: originalId },
      include: { regionalOffice: true },
    });
    if (!original) throw new NotFoundException('Submission not found');
    if (original.roId !== user.roId) {
      throw new ForbiddenException('You cannot resubmit this submission');
    }
    if (original.status !== SubmissionStatus.REJECTED) {
      throw new BadRequestException('Only rejected submissions can be resubmitted');
    }
    if (!file) throw new BadRequestException('A new attachment is required');
    if (dto.paymentType === PaymentType.OTHER && !dto.paymentTypeNote?.trim()) {
      throw new BadRequestException(
        'A payment type note is required when type is Other',
      );
    }

    const paymentDate = new Date(dto.paymentDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (paymentDate > today) {
      throw new BadRequestException('Payment date cannot be in the future');
    }

    const id = uuidv4();
    const saved = await this.storage.save(file, id);

    const created = await this.prisma.paymentSubmission.create({
      data: {
        id,
        roId: original.roId,
        submittedById: user.sub,
        requestType: dto.requestType,
        paymentType: dto.paymentType,
        paymentTypeNote: dto.paymentTypeNote ?? null,
        amount: new Prisma.Decimal(dto.amount),
        paymentDate,
        bankName: dto.bankName,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes ?? null,
        attachmentPath: saved.path,
        attachmentOriginalName: saved.originalName,
        attachmentMimeType: saved.mimeType,
        status: SubmissionStatus.SUBMITTED,
        version: original.version + 1,
        parentId: original.id,
      },
      include: SUBMISSION_INCLUDE,
    });

    await this.prisma.submissionStatusHistory.create({
      data: {
        submissionId: id,
        fromStatus: null,
        toStatus: SubmissionStatus.SUBMITTED,
        changedById: user.sub,
      },
    });

    this.events.emit(NotificationEvents.RESUBMITTED, {
      submission: created,
      originalId: original.id,
      roName: original.regionalOffice.name,
    });

    return serializeSubmission(created, this.storage);
  }

  // --- history (whole resubmission chain, chronological) --------------------

  async history(user: AuthUser, id: string) {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (!this.isAdmin(user) && submission.roId !== user.roId) {
      throw new ForbiddenException('You cannot access this submission');
    }

    // Walk to the root of the chain, then collect all versions.
    let root = submission;
    while (root.parentId) {
      const parent = await this.prisma.paymentSubmission.findUnique({
        where: { id: root.parentId },
      });
      if (!parent) break;
      root = parent;
    }
    const chain = await this.collectChain(root.id);
    const versionById = new Map(chain.map((c) => [c.id, c.version]));

    const events = await this.prisma.submissionStatusHistory.findMany({
      where: { submissionId: { in: chain.map((c) => c.id) } },
      include: { changedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return events.map((e) => ({
      id: e.id,
      submissionId: e.submissionId,
      version: versionById.get(e.submissionId) ?? 1,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      reason: e.reason,
      changedBy: e.changedBy,
      createdAt: e.createdAt,
    }));
  }

  private async collectChain(rootId: string) {
    const all: { id: string; version: number }[] = [];
    let current: string[] = [rootId];
    while (current.length) {
      const rows = await this.prisma.paymentSubmission.findMany({
        where: { id: { in: current } },
        select: { id: true, version: true },
      });
      all.push(...rows);
      const children = await this.prisma.paymentSubmission.findMany({
        where: { parentId: { in: current } },
        select: { id: true },
      });
      current = children.map((c) => c.id);
    }
    return all;
  }

  // --- CSV export (admin) ---------------------------------------------------

  async exportCsv(user: AuthUser, query: QuerySubmissionsDto): Promise<string> {
    const all = await this.list(user, { ...query, page: 1, limit: 10000 } as QuerySubmissionsDto);
    const header = [
      'Submission ID',
      'RO',
      'Submitted By',
      'Request Type',
      'Payment Method',
      'Amount (PKR)',
      'Payment Date',
      'Bank',
      'Reference',
      'Status',
      'Version',
      'Submitted At',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = all.data.map((s: any) =>
      [
        s.id,
        s.ro?.name,
        s.submittedBy?.fullName,
        s.requestType,
        s.paymentType,
        s.amount,
        s.paymentDate,
        s.bankName,
        s.referenceNumber,
        s.status,
        s.version,
        new Date(s.createdAt).toISOString(),
      ]
        .map(esc)
        .join(','),
    );
    return [header.map(esc).join(','), ...rows].join('\n');
  }

  // --- dashboards -----------------------------------------------------------

  private monthBounds() {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  /** Approved credits/debits for the current month, optionally scoped to one RO. */
  private async monthlyBalance(roId?: string): Promise<MonthlyBalance> {
    const { start, end } = this.monthBounds();
    const grouped = await this.prisma.paymentSubmission.groupBy({
      by: ['requestType'],
      where: {
        status: 'APPROVED',
        paymentDate: { gte: start, lt: end },
        ...(roId ? { roId } : {}),
      },
      _sum: { amount: true },
    });

    const balance = emptyBalance();
    let credited = 0;
    let debited = 0;
    for (const g of grouped) {
      const amt = Number(g._sum.amount ?? 0);
      balance.byType[g.requestType] = amt.toFixed(2);
      if (CREDIT_TYPES.has(g.requestType)) credited += amt;
      else debited += amt;
    }

    // Manual ledger adjustments created by admins (effective this month).
    const adjustments = await this.prisma.ledgerAdjustment.groupBy({
      by: ['type'],
      where: {
        effectiveDate: { gte: start, lt: end },
        ...(roId ? { roId } : {}),
      },
      _sum: { amount: true },
    });
    for (const a of adjustments) {
      const amt = Number(a._sum.amount ?? 0);
      if (a.type === 'CREDIT') credited += amt;
      else debited += amt;
    }

    balance.credited = credited.toFixed(2);
    balance.debited = debited.toFixed(2);
    balance.net = (credited - debited).toFixed(2);
    return balance;
  }

  async roStats(user: AuthUser) {
    const roId = user.roId ?? '__none__';
    const [total, submitted, underReview, approved, rejected, recent] =
      await this.prisma.$transaction([
        this.prisma.paymentSubmission.count({ where: { roId } }),
        this.prisma.paymentSubmission.count({ where: { roId, status: 'SUBMITTED' } }),
        this.prisma.paymentSubmission.count({ where: { roId, status: 'UNDER_REVIEW' } }),
        this.prisma.paymentSubmission.count({ where: { roId, status: 'APPROVED' } }),
        this.prisma.paymentSubmission.count({ where: { roId, status: 'REJECTED' } }),
        this.prisma.paymentSubmission.findMany({
          where: { roId },
          include: SUBMISSION_INCLUDE,
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);
    return {
      total,
      pending: submitted + underReview,
      approved,
      rejected,
      balance: await this.monthlyBalance(roId),
      recent: recent.map((r) => serializeSubmission(r, this.storage)),
    };
  }

  async adminStats() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [total, pendingReview, approvedThisMonth, rejectedThisMonth, queue, ros] =
      await this.prisma.$transaction([
        this.prisma.paymentSubmission.count(),
        this.prisma.paymentSubmission.count({
          where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        }),
        this.prisma.paymentSubmission.count({
          where: { status: 'APPROVED', updatedAt: { gte: startOfMonth } },
        }),
        this.prisma.paymentSubmission.count({
          where: { status: 'REJECTED', updatedAt: { gte: startOfMonth } },
        }),
        this.prisma.paymentSubmission.findMany({
          where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
          include: SUBMISSION_INCLUDE,
          orderBy: { createdAt: 'asc' },
          take: 20,
        }),
        this.prisma.regionalOffice.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    const perRo = await Promise.all(
      ros.map(async (ro) => {
        const [pending, last] = await this.prisma.$transaction([
          this.prisma.paymentSubmission.count({
            where: { roId: ro.id, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
          }),
          this.prisma.paymentSubmission.findFirst({
            where: { roId: ro.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
        ]);
        const balance = await this.monthlyBalance(ro.id);
        return {
          roId: ro.id,
          name: ro.name,
          code: ro.code,
          pending,
          lastSubmissionAt: last?.createdAt ?? null,
          credited: balance.credited,
          debited: balance.debited,
          net: balance.net,
        };
      }),
    );

    return {
      total,
      pendingReview,
      approvedThisMonth,
      rejectedThisMonth,
      balance: await this.monthlyBalance(),
      queue: queue.map((q) => serializeSubmission(q, this.storage)),
      perRo,
    };
  }

  /**
   * Combined running statement for one RO: approved deposit requests (credit) +
   * approved expense/salary/vendor requests (debit) + manual adjustments.
   * Computed server-side so there's no list-pagination cap. Outstanding =
   * cumulative debits − credits (positive ⇒ RO owes IRBAS).
   */
  async ledger(user: AuthUser, roIdParam?: string) {
    const zero = { credited: '0.00', debited: '0.00', outstanding: '0.00' };
    const roId = this.isAdmin(user) ? roIdParam : user.roId ?? undefined;
    if (!roId) return { entries: [], totals: zero };

    const [subs, adjs] = await Promise.all([
      this.prisma.paymentSubmission.findMany({
        where: { roId, status: SubmissionStatus.APPROVED },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          requestType: true,
          bankName: true,
        },
      }),
      this.prisma.ledgerAdjustment.findMany({
        where: { roId },
        include: { createdBy: { select: { fullName: true } } },
      }),
    ]);

    type Raw = {
      sortKey: number;
      dir: 'CREDIT' | 'DEBIT';
      amt: number;
      entry: Record<string, unknown>;
    };
    const raw: Raw[] = [];

    for (const s of subs) {
      const dir: 'CREDIT' | 'DEBIT' = CREDIT_TYPES.has(s.requestType)
        ? 'CREDIT'
        : 'DEBIT';
      // Approved submissions always carry a confirmed amount (enforced at
      // approval); guard for null defensively so the ledger never NaNs.
      const amt = s.amount === null ? 0 : Number(s.amount);
      raw.push({
        sortKey: s.paymentDate.getTime(),
        dir,
        amt,
        entry: {
          id: `s-${s.id}`,
          kind: 'REQUEST',
          date: s.paymentDate.toISOString().slice(0, 10),
          direction: dir,
          amount: amt.toFixed(2),
          submissionId: s.id,
          requestType: s.requestType,
          reference: s.id.slice(0, 8).toUpperCase(),
          bankName: s.bankName,
        },
      });
    }

    for (const a of adjs) {
      const amt = Number(a.amount);
      raw.push({
        sortKey: a.effectiveDate.getTime(),
        dir: a.type,
        amt,
        entry: {
          id: `a-${a.id}`,
          kind: 'ADJUSTMENT',
          date: a.effectiveDate.toISOString().slice(0, 10),
          direction: a.type,
          amount: amt.toFixed(2),
          adjustmentId: a.id,
          description: a.description,
          by: a.createdBy?.fullName ?? null,
        },
      });
    }

    raw.sort((x, y) => x.sortKey - y.sortKey);

    let running = 0;
    let credited = 0;
    let debited = 0;
    const entries = raw.map((r) => {
      if (r.dir === 'DEBIT') {
        running += r.amt;
        debited += r.amt;
      } else {
        running -= r.amt;
        credited += r.amt;
      }
      return { ...r.entry, running: running.toFixed(2) };
    });

    return {
      entries,
      totals: {
        credited: credited.toFixed(2),
        debited: debited.toFixed(2),
        outstanding: (debited - credited).toFixed(2),
      },
    };
  }
}

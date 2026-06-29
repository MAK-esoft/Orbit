import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, Role, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationEvents,
  ResubmittedEvent,
  StatusChangedEvent,
  SubmissionCreatedEvent,
} from './notification-events';

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatAmount(amount: Prisma.Decimal | string | null): string {
  if (amount === null) return 'an unconfirmed amount';
  return `PKR ${Number(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- queries --------------------------------------------------------------

  async list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string) {
    const notif = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notif) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  // --- recipients -----------------------------------------------------------

  private async adminIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] }, isActive: true },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  }

  private async roUserIds(roId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { roId, role: Role.RO_USER, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async createMany(
    userIds: string[],
    data: { type: string; title: string; body: string; submissionId: string },
  ) {
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, ...data })),
    });
  }

  // --- event listeners (spec §11.2) -----------------------------------------

  @OnEvent(NotificationEvents.SUBMISSION_CREATED)
  async onSubmissionCreated({ submission, roName }: SubmissionCreatedEvent) {
    await this.createMany(await this.adminIds(), {
      type: 'SUBMISSION_RECEIVED',
      title: 'New payment request submitted',
      body: `${roName} submitted a ${submission.paymentType.replace(
        '_',
        ' ',
      )} request of ${formatAmount(submission.amount)}`,
      submissionId: submission.id,
    });
  }

  @OnEvent(NotificationEvents.STATUS_CHANGED)
  async onStatusChanged({ submission, toStatus }: StatusChangedEvent) {
    const recipients = await this.roUserIds(submission.roId);
    const ref = shortId(submission.id);

    let title = '';
    let body = '';
    let type = 'STATUS_CHANGED';
    switch (toStatus) {
      case SubmissionStatus.UNDER_REVIEW:
        title = 'Your request is under review';
        body = `Your request #${ref} is being reviewed by the team`;
        break;
      case SubmissionStatus.APPROVED:
        title = 'Payment request approved';
        body = `Your request #${ref} for ${formatAmount(
          submission.amount,
        )} has been approved`;
        break;
      case SubmissionStatus.REJECTED:
        type = 'PROOF_REJECTED';
        title = 'Payment request rejected';
        body = `Your request #${ref} was rejected. Tap to view the reason and resubmit`;
        break;
      default:
        return; // no notification for transitions back to SUBMITTED
    }
    await this.createMany(recipients, {
      type,
      title,
      body,
      submissionId: submission.id,
    });
  }

  @OnEvent(NotificationEvents.RESUBMITTED)
  async onResubmitted({ submission, originalId, roName }: ResubmittedEvent) {
    await this.createMany(await this.adminIds(), {
      type: 'PROOF_RESUBMITTED',
      title: 'Request resubmitted',
      body: `${roName} has resubmitted request #${shortId(originalId)}`,
      submissionId: submission.id,
    });
  }
}

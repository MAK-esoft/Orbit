import { PaymentSubmission, SubmissionStatus } from '@prisma/client';

/** Event names emitted by the Submissions module and consumed here. */
export const NotificationEvents = {
  SUBMISSION_CREATED: 'submission.created',
  STATUS_CHANGED: 'submission.status_changed',
  RESUBMITTED: 'submission.resubmitted',
} as const;

export interface SubmissionCreatedEvent {
  submission: PaymentSubmission;
  roName: string;
}

export interface StatusChangedEvent {
  submission: PaymentSubmission;
  fromStatus: SubmissionStatus | null;
  toStatus: SubmissionStatus;
  reason?: string | null;
}

export interface ResubmittedEvent {
  submission: PaymentSubmission; // the new version
  originalId: string;
  roName: string;
}

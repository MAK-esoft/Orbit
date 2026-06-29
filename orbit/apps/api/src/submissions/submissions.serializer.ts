import { STORAGE_SERVICE, StorageService } from '../files/storage/storage.interface';

/** Decimal | null → fixed string | null (amounts are strings per spec §13.1). */
function decimalOrNull(v: any): string | null {
  return v === null || v === undefined ? null : v.toFixed(2);
}

/** AI-extracted data, always serialized as a separate block (never merged). */
function serializeExtraction(e: any) {
  if (!e) return null;
  return {
    classification: e.classification,
    extractedAmount: decimalOrNull(e.extractedAmount),
    extractedPaymentMethod: e.extractedPaymentMethod,
    slipRef: e.slipRef,
    merchant: e.merchant,
    description: e.description,
    bankEmailMatch: e.bankEmailMatch,
    bankEmailAmount: decimalOrNull(e.bankEmailAmount),
    bankEmailTimestamp: e.bankEmailTimestamp,
    confidence: e.confidence,
    model: e.model,
    createdAt: e.createdAt,
  };
}

/** Shared shape helpers — amounts as strings, dates as ISO (spec §13.1). */
export function serializeSubmission(s: any, storage: StorageService) {
  return {
    id: s.id,
    roId: s.roId,
    ro: s.regionalOffice
      ? { id: s.regionalOffice.id, name: s.regionalOffice.name, code: s.regionalOffice.code }
      : undefined,
    submittedById: s.submittedById,
    submittedBy: s.submittedBy
      ? { id: s.submittedBy.id, fullName: s.submittedBy.fullName }
      : undefined,
    requestType: s.requestType,
    paymentType: s.paymentType,
    paymentTypeNote: s.paymentTypeNote,
    amount: decimalOrNull(s.amount),
    paymentDate: s.paymentDate.toISOString().slice(0, 10),
    bankName: s.bankName,
    referenceNumber: s.referenceNumber,
    notes: s.notes,
    source: s.source,
    enrichmentStatus: s.enrichmentStatus,
    senderRef: s.senderRef,
    attachment: s.attachmentPath
      ? {
          path: s.attachmentPath,
          originalName: s.attachmentOriginalName,
          mimeType: s.attachmentMimeType,
          url: storage.getUrl(s.attachmentPath),
        }
      : null,
    extraction: s.extraction !== undefined ? serializeExtraction(s.extraction) : undefined,
    status: s.status,
    version: s.version,
    parentId: s.parentId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export const SUBMISSION_INCLUDE = {
  regionalOffice: { select: { id: true, name: true, code: true } },
  submittedBy: { select: { id: true, fullName: true } },
  extraction: true,
} as const;

export { STORAGE_SERVICE };

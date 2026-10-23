import type { VerificationStatus, VerificationWebhookEvent } from "./verification.types";

export type WebhookEventType = VerificationWebhookEvent;

export interface WebhookEventPayloadMap {
  [VerificationWebhookEvent.JOB_CREATED]: {
    jobId: string;
    contentHash: string;
    status: VerificationStatus;
  };
  [VerificationWebhookEvent.COMPLETED]: {
    jobId: string;
    contentHash: string;
    status: VerificationStatus;
    certificateId?: string;
    txHash?: string;
  };
  [VerificationWebhookEvent.FAILED]: {
    jobId: string;
    contentHash: string;
    status: VerificationStatus;
    errorMessage?: string;
  };
  [VerificationWebhookEvent.MINTED]: {
    jobId: string;
    contentHash: string;
    certificateId: string;
    txHash?: string;
  };
  [VerificationWebhookEvent.KMS_KEY_ROTATED]: {
    keyVersion: string;
    previousKeyVersion: string;
    assetsReEncrypted: number;
  };
}

export interface WebhookEvent<T extends WebhookEventType = WebhookEventType> {
  id: string;
  type: T;
  occurredAt: string;
  data: WebhookEventPayloadMap[T];
}

export interface WebhookSubscription {
  events: WebhookEventType[];
}

export type WebhookDeliveryStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed"
  | "dead_letter";

export interface WebhookDeliverySummary {
  id: string;
  eventType: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseCode: number | null;
  latencyMs: number | null;
  payloadPreview: string;
  createdAt: Date;
  deliveredAt?: Date;
  nextAttemptAt?: Date;
}

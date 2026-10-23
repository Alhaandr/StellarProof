import mongoose, { Schema } from "mongoose";
import { VerificationWebhookEvent } from "../types/verification.types";
import type { WebhookDeliveryStatus, WebhookEvent, WebhookEventType } from "../types/webhook.types";

export interface IWebhookDelivery extends mongoose.Document {
  registrationId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  eventId: string;
  eventType: WebhookEventType;
  payload: WebhookEvent;
  payloadPreview: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockExpiresAt?: Date;
  responseCode?: number;
  latencyMs?: number;
  lastError?: string;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    registrationId: {
      type: Schema.Types.ObjectId,
      ref: "WebhookRegistration",
      required: true,
      index: true,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventId: { type: String, required: true },
    eventType: {
      type: String,
      required: true,
      enum: Object.values(VerificationWebhookEvent),
    },
    payload: { type: Schema.Types.Mixed, required: true },
    payloadPreview: { type: String, required: true, maxlength: 512 },
    status: {
      type: String,
      required: true,
      enum: ["pending", "processing", "delivered", "failed", "dead_letter"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 5, min: 1 },
    nextAttemptAt: { type: Date, required: true, default: Date.now, index: true },
    lockExpiresAt: { type: Date },
    responseCode: { type: Number, min: 100, max: 599 },
    latencyMs: { type: Number, min: 0 },
    lastError: { type: String, maxlength: 1000 },
    deliveredAt: { type: Date },
  },
  { timestamps: true }
);

WebhookDeliverySchema.index({ registrationId: 1, eventId: 1 }, { unique: true });
WebhookDeliverySchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

export default (mongoose.models.WebhookDelivery as mongoose.Model<IWebhookDelivery> | undefined) ??
  mongoose.model<IWebhookDelivery>("WebhookDelivery", WebhookDeliverySchema);

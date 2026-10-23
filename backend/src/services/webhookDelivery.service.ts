import mongoose from "mongoose";
import { AppError } from "../errors/AppError";
import WebhookDelivery from "../models/WebhookDelivery.model";
import WebhookRegistration from "../models/WebhookRegistration.model";
import type { WebhookDeliverySummary } from "../types/webhook.types";

export interface WebhookDeliveryPage {
  deliveries: WebhookDeliverySummary[];
  total: number;
  limit: number;
  skip: number;
}

export class WebhookDeliveryService {
  async listForRegistration(
    ownerId: string,
    registrationId: string,
    limit: number,
    skip: number
  ): Promise<WebhookDeliveryPage> {
    if (!mongoose.Types.ObjectId.isValid(ownerId) || !mongoose.Types.ObjectId.isValid(registrationId)) {
      throw new AppError("Invalid webhook registration ID", 400, "INVALID_ID");
    }
    const registration = await WebhookRegistration.exists({ _id: registrationId, ownerId });
    if (!registration) throw new AppError("Webhook registration not found", 404, "WEBHOOK_NOT_FOUND");

    const filter = { registrationId, ownerId };
    const [rows, total] = await Promise.all([
      WebhookDelivery.find(filter)
        .select("eventType status attempts responseCode latencyMs payloadPreview createdAt deliveredAt nextAttemptAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WebhookDelivery.countDocuments(filter),
    ]);
    return {
      deliveries: rows.map((delivery) => ({
        id: String(delivery._id),
        eventType: delivery.eventType,
        status: delivery.status,
        attempts: delivery.attempts,
        responseCode: delivery.responseCode ?? null,
        latencyMs: delivery.latencyMs ?? null,
        payloadPreview: delivery.payloadPreview,
        createdAt: delivery.createdAt,
        ...(delivery.deliveredAt ? { deliveredAt: delivery.deliveredAt } : {}),
        ...(delivery.status === "pending" ? { nextAttemptAt: delivery.nextAttemptAt } : {}),
      })),
      total,
      limit,
      skip,
    };
  }
}

export const webhookDeliveryService = new WebhookDeliveryService();

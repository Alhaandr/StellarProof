/**
 * Developer Routes.
 *
 * Endpoints:
 *   POST /api/v1/developer/keys
 *     Generates a new API key for the authenticated/submitted user.
 *
 *   POST /api/v1/developer/webhooks/:id/deliveries/:deliveryId/replay
 *     Re-dispatches a failed webhook delivery using the payload and HMAC
 *     signature stored at dispatch time. Only `failed` deliveries are
 *     replayable (409 otherwise). Requires an x-api-key header; only the
 *     delivery's owner (or an admin) may replay it.
 *
 * All Zod schemas are co-located with the routes that use them and are
 * exported so the validation contract can be unit-tested directly.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { generateApiKey, replayWebhookDelivery } from '../controllers/developer.controller';
import { verifyApiKey } from '../middlewares/apiKey.middleware';

const router = Router();

router.post('/keys', generateApiKey);

// ---------------------------------------------------------------------------
// Zod schema – path parameters for the delivery replay endpoint.
// ---------------------------------------------------------------------------
export const replayDeliveryParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'webhook id is required')
    .max(128, 'webhook id must be at most 128 characters'),
  deliveryId: z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'deliveryId must be a valid MongoDB ObjectId'),
});

// ---------------------------------------------------------------------------
// Path parameter validation middleware
// ---------------------------------------------------------------------------
function validateReplayDeliveryParams(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = replayDeliveryParamsSchema.safeParse(req.params);
  if (!result.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: 'Invalid path parameters',
      details: result.error.flatten().fieldErrors,
    });
    return;
  }
  next();
}

/**
 * POST /api/v1/developer/webhooks/:id/deliveries/:deliveryId/replay
 *
 * Response 200:
 * {
 *   "success": true,
 *   "message": "Webhook delivery replayed successfully.",
 *   "data": {
 *     "delivery": { "id": "...", "status": "delivered", "attempts": 2, ... },
 *     "delivered": true,
 *     "responseStatus": 200
 *   }
 * }
 */
router.post(
  '/webhooks/:id/deliveries/:deliveryId/replay',
  verifyApiKey,
  validateReplayDeliveryParams,
  replayWebhookDelivery
);

export default router;

import { Router } from 'express';
import { generateApiKey, getApiKeyUsage } from '../controllers/developer.controller';
import { verifyJWT } from '../middlewares/jwt.middleware';

const router = Router();
const webhookEvents = Object.values(VerificationWebhookEvent) as [
  VerificationWebhookEvent,
  ...VerificationWebhookEvent[],
];
const idParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'id must be a valid MongoDB ObjectId'),
});
const createWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(webhookEvents)).min(1),
}).strict();
const updateWebhookSchema = z.object({
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(webhookEvents)).min(1).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one update field is required');
const deliveryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
});

function validateDeliveryQuery(req: Request, res: Response, next: NextFunction): void {
  const parsed = deliveryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid pagination parameters',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  res.locals.deliveryPagination = parsed.data;
  next();
}

// Apply authentication middleware to all routes
router.use(protect);
router.use(restrictTo('developer', 'admin'));

// API Key management
router.post('/keys', generateApiKey);
router.post('/webhooks', protect, createWebhookRegistration);
router.get('/webhooks', protect, listWebhookRegistrations);
router.patch('/webhooks/:id', protect, updateWebhookRegistration);
router.delete('/webhooks/:id', protect, deleteWebhookRegistration);
router.post('/kms/backups', protect, createKmsBackup);
router.get('/kms/backups', protect, listKmsBackups);
router.post('/kms/backups/:id/restore', protect, restoreKmsBackup);

// App management
router.post('/apps', zodBody(createAppSchema), createDeveloperApp);
router.get('/apps', listDeveloperApps);
router.get('/apps/:appId', zodParams(appIdSchema), getAppDetailsController);

// Webhook registration
router.post(
  '/apps/:appId/webhooks',
  zodParams(appIdSchema),
  zodBody(registerWebhookSchema),
  registerAppWebhook
);

/**
 * GET /api/v1/developer/api-keys/:keyId/usage
 * Retrieve aggregated API usage metrics for a specific API key.
 * 
 * Authentication: Required (JWT or API Key)
 * Authorization: Caller must own the API key
 * 
 * Query parameters:
 *   - from: ISO date string (defaults to 7 days ago)
 *   - to: ISO date string (defaults to now)
 *   - endpoint: optional filter by endpoint pattern
 *   - granularity: 'hour' or 'day' (defaults to 'hour')
 *   - limit: max results (defaults to 1000, max 10000)
 *   - skip: pagination offset (defaults to 0)
 * 
 * Response:
 *   {
 *     "success": true,
 *     "data": {
 *       "apiKeyId": "sha256hash...",
 *       "period": { "from": "2024-01-15T00:00:00Z", "to": "2024-01-22T00:00:00Z" },
 *       "totalRequests": 1234,
 *       "byEndpoint": [
 *         { "endpoint": "/api/v1/certificates", "method": "POST", "totalRequests": 500, "statusCodeBreakdown": { "201": 500 } },
 *         ...
 *       ],
 *       "byStatusCode": { "201": 500, "400": 10, "500": 5 },
 *       "hourlyBreakdown": [
 *         { "hour": "2024-01-15T00:00:00Z", "requests": 45, "statusCodeBreakdown": { "201": 45 } },
 *         ...
 *       ]
 *     }
 *   }
 */
router.get('/api-keys/:keyId/usage', verifyJWT, getApiKeyUsage);

export default router;

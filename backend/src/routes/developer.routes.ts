import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { generateApiKey, developerController } from '../controllers/developer.controller';
import { protect } from '../middlewares/auth.middleware';

const MONGO_OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
const STATUS_VALUES = [
  'pending',
  'processing',
  'tee_verifying',
  'minting',
  'completed',
  'failed',
];

/**
 * Validation schema for list jobs query parameters
 */
const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  status: z.enum(STATUS_VALUES as [string, ...string[]]).optional(),
  appId: z.string().optional(),
  jobType: z.string().optional(),
  createdFrom: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date format')
    .optional(),
  createdTo: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date format')
    .optional(),
  sortBy: z.enum(['createdAt', 'status', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Validation schema for usage summary query parameters
 */
const usageSummaryQuerySchema = z.object({
  from: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date format')
    .optional(),
  to: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date format')
    .optional(),
});

/**
 * Validation schema for job ID parameter
 */
const jobIdParamSchema = z.object({
  id: z.string().regex(MONGO_OBJECT_ID_REGEX, 'Invalid job ID format'),
});

/**
 * Middleware to validate list jobs query parameters
 */
function validateListJobsQuery(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = listJobsQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: 'Invalid query parameters',
      details: result.error.flatten().fieldErrors,
    });
    return;
  }
  Object.assign(req.query, result.data);
  next();
}

/**
 * Middleware to validate usage summary query parameters
 */
function validateUsageSummaryQuery(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = usageSummaryQuerySchema.safeParse(req.query);
  if (!result.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: 'Invalid query parameters',
      details: result.error.flatten().fieldErrors,
    });
    return;
  }
  Object.assign(req.query, result.data);
  next();
}

/**
 * Middleware to validate job ID parameter
 */
function validateJobIdParam(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = jobIdParamSchema.safeParse({ id: req.params.id });
  if (!result.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: 'Invalid job ID format',
      details: result.error.flatten().fieldErrors,
    });
    return;
  }
  next();
}

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

/**
 * @swagger
 * /api/v1/developer/keys:
 *   post:
 *     summary: Generate API key (legacy endpoint)
 *     tags: [Developer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       201: { description: API key generated }
 *       400: { description: Invalid parameters }
 */
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

/**
 * @swagger
 * /api/v1/developer/jobs:
 *   get:
 *     summary: List jobs across all developer apps
 *     tags: [Developer]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 200, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: ['pending', 'processing', 'tee_verifying', 'minting', 'completed', 'failed'] } }
 *       - { in: query, name: appId, schema: { type: string } }
 *       - { in: query, name: jobType, schema: { type: string } }
 *       - { in: query, name: createdFrom, schema: { type: string, format: date-time } }
 *       - { in: query, name: createdTo, schema: { type: string, format: date-time } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: ['createdAt', 'status', 'updatedAt'], default: 'createdAt' } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: ['asc', 'desc'], default: 'desc' } }
 *     responses:
 *       200: { description: List of jobs with pagination }
 *       400: { description: Invalid query parameters }
 *       401: { description: Authentication required }
 */
router.get(
  '/jobs',
  protect,
  validateListJobsQuery,
  developerController.listJobs.bind(developerController)
);

/**
 * @swagger
 * /api/v1/developer/jobs/{id}:
 *   get:
 *     summary: Get a single job by ID
 *     tags: [Developer]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, pattern: '^[a-f0-9]{24}$' } }
 *     responses:
 *       200: { description: Job details }
 *       400: { description: Invalid job ID format }
 *       401: { description: Authentication required }
 *       404: { description: Job not found or not owned by developer }
 */
router.get(
  '/jobs/:id',
  protect,
  validateJobIdParam,
  developerController.getJobById.bind(developerController)
);

/**
 * @swagger
 * /api/v1/developer/usage/summary:
 *   get:
 *     summary: Get usage summary for developer
 *     tags: [Developer]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Usage summary with status counts and per-app breakdown }
 *       400: { description: Invalid date parameters }
 *       401: { description: Authentication required }
 */
router.get(
  '/usage/summary',
  protect,
  validateUsageSummaryQuery,
  developerController.getUsageSummary.bind(developerController)
);

export default router;

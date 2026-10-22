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

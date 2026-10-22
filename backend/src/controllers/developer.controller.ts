import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { generateApiKeyForUser } from '../services/developer.service';
import { developerJobService } from '../services/developerJob.service';
import { AppError } from '../errors/AppError';
import type {
  ListDeveloperJobsQuery,
  GetUsageSummaryQuery,
  ListDeveloperJobsResponse,
  GetDeveloperJobResponse,
  UsageSummaryResponse,
  ValidatedListJobsQuery,
  ValidatedUsageSummaryQuery,
} from '../types/developer.types';

/**
 * Legacy API key generation endpoint
 */
export const generateApiKey = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.body.userId || (req as any).user?.id;

    if (!userId) {
      res
        .status(401)
        .json({
          success: false,
          message: 'Unauthorized. User ID required.',
        });
      return;
    }

    const plainTextApiKey = await generateApiKeyForUser(userId);

    res.status(201).json({
      success: true,
      message: 'API key generated successfully.',
      key: plainTextApiKey,
    });
  } catch (error: any) {
    console.error('[API Key Error]', error);
    if (error.message === 'User not found') {
      res.status(404).json({ success: false, message: error.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Developer controller with class-based handlers
 */
class DeveloperController {
  /**
   * GET /api/v1/developer/jobs
   *
   * List jobs across all of the developer's apps
   * with filters, pagination, and sorting.
   */
  async listJobs(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Extract authenticated developer
      const user = (req as any).user;
      if (!user || !user.stellarPublicKey || !user._id) {
        throw new AppError(
          'Unauthorized',
          StatusCodes.UNAUTHORIZED,
          'UNAUTHORIZED'
        );
      }

      // Parse and validate query parameters
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit as string) || 20));
      const status = req.query.status as string | undefined;
      const appId = req.query.appId as string | undefined;
      const jobType = req.query.jobType as string | undefined;
      const createdFrom = req.query.createdFrom as string | undefined;
      const createdTo = req.query.createdTo as string | undefined;
      const sortBy = (req.query.sortBy as string) || 'createdAt';
      const sortOrder = (req.query.sortOrder as string) || 'desc';

      // Validate status if provided
      if (status && !isValidStatus(status)) {
        throw new AppError(
          'Invalid status value',
          StatusCodes.BAD_REQUEST,
          'INVALID_STATUS'
        );
      }

      // Validate date parameters
      let createdFromDate: Date | undefined;
      let createdToDate: Date | undefined;

      if (createdFrom) {
        createdFromDate = new Date(createdFrom);
        if (isNaN(createdFromDate.getTime())) {
          throw new AppError(
            'Invalid createdFrom date',
            StatusCodes.BAD_REQUEST,
            'INVALID_DATE'
          );
        }
      }

      if (createdTo) {
        createdToDate = new Date(createdTo);
        if (isNaN(createdToDate.getTime())) {
          throw new AppError(
            'Invalid createdTo date',
            StatusCodes.BAD_REQUEST,
            'INVALID_DATE'
          );
        }
      }

      if (createdFromDate && createdToDate && createdFromDate > createdToDate) {
        throw new AppError(
          'createdFrom must be before createdTo',
          StatusCodes.BAD_REQUEST,
          'INVALID_DATE_RANGE'
        );
      }

      // Build validated query
      const query: ValidatedListJobsQuery = {
        status: status as any,
        appId,
        jobType,
        createdFrom: createdFromDate,
        createdTo: createdToDate,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
        page,
        limit,
      };

      // Call service
      const result = await developerJobService.listJobs(
        user._id.toString(),
        user.stellarPublicKey,
        query
      );

      // Format response
      const response: ListDeveloperJobsResponse = {
        success: true,
        data: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      };

      res.status(StatusCodes.OK).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/developer/jobs/:id
   *
   * Retrieve a single job by ID with full details,
   * verifying the developer owns it.
   */
  async getJobById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Extract authenticated developer
      const user = (req as any).user;
      if (!user || !user.stellarPublicKey || !user._id) {
        throw new AppError(
          'Unauthorized',
          StatusCodes.UNAUTHORIZED,
          'UNAUTHORIZED'
        );
      }

      const jobId = req.params.id;

      // Call service (will throw 400 or 404 as needed)
      const job = await developerJobService.getJobById(
        user._id.toString(),
        user.stellarPublicKey,
        jobId
      );

      const response: GetDeveloperJobResponse = {
        success: true,
        data: job,
      };

      res.status(StatusCodes.OK).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/developer/usage/summary
   *
   * Retrieve usage summary for the developer
   * with status counts and per-app breakdown
   * over a specified date range.
   */
  async getUsageSummary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Extract authenticated developer
      const user = (req as any).user;
      if (!user || !user.stellarPublicKey || !user._id) {
        throw new AppError(
          'Unauthorized',
          StatusCodes.UNAUTHORIZED,
          'UNAUTHORIZED'
        );
      }

      // Parse and validate query parameters
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      // Default date range: last 30 days
      const now = new Date();
      const toDate = to ? new Date(to) : now;
      const fromDate = from
        ? new Date(from)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Validate dates
      if (isNaN(fromDate.getTime())) {
        throw new AppError(
          'Invalid from date',
          StatusCodes.BAD_REQUEST,
          'INVALID_DATE'
        );
      }

      if (isNaN(toDate.getTime())) {
        throw new AppError(
          'Invalid to date',
          StatusCodes.BAD_REQUEST,
          'INVALID_DATE'
        );
      }

      if (fromDate > toDate) {
        throw new AppError(
          'from date must be before to date',
          StatusCodes.BAD_REQUEST,
          'INVALID_DATE_RANGE'
        );
      }

      // Build validated query
      const query: ValidatedUsageSummaryQuery = {
        from: fromDate,
        to: toDate,
      };

      // Call service
      const result = await developerJobService.getUsageSummary(
        user._id.toString(),
        user.stellarPublicKey,
        query
      );

      const response: UsageSummaryResponse = {
        success: true,
        data: {
          period: result.period,
          totalJobs: result.totalJobs,
          statusCounts: result.statusCounts,
          successRate: result.successRate,
          apps: result.apps,
        },
      };

      res.status(StatusCodes.OK).json(response);
    } catch (err) {
      next(err);
    }
  }
}

// Helper function to validate status
function isValidStatus(status: string): boolean {
  const validStatuses = [
    'pending',
    'processing',
    'tee_verifying',
    'minting',
    'completed',
    'failed',
  ];
  return validStatuses.includes(status);
}

export const developerController = new DeveloperController();

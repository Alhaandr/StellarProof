import { Request, Response, NextFunction } from 'express';
import { generateApiKeyForUser } from '../services/developer.service';
import { apiKeyUsageService } from '../services/apiKeyUsage.service';
import { userService } from '../services/user.service';
import { AppError } from '../errors/AppError';

/**
 * Generate API key for user
 * @route POST /api/v1/developer/keys
 */
export const generateApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.body.userId || (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized. User ID required.' });
      return;
    }

    const plainTextApiKey = await generateApiKeyForUser(userId);
    
    res.status(201).json({
      success: true,
      message: 'API key generated successfully.',
      key: plainTextApiKey
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
 * Get API key usage for a specific API key.
 * 
 * Query parameters:
 * - from: ISO date string (defaults to 7 days ago)
 * - to: ISO date string (defaults to now)
 * - endpoint: optional filter by endpoint
 * - granularity: 'hour' or 'day' (defaults to 'hour')
 * - limit: max results (defaults to 1000, capped at 10000)
 * - skip: pagination offset (defaults to 0)
 * 
 * Authentication required. Caller must own the API key being queried.
 */
export const getApiKeyUsage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const keyId = req.params.keyId;
    const userId = req.user?._id?.toString();

    if (!userId) {
      return next(new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED'));
    }

    if (!keyId) {
      return next(new AppError('API key ID is required', 400, 'MISSING_KEY_ID'));
    }

    // ── Verify caller owns this API key ────────────────────────────────────
    // Get the user to check if they own this hashed key
    const user = await userService.getProfile(userId);
    if (!user) {
      return next(new AppError('User not found', 404, 'USER_NOT_FOUND'));
    }

    // Check if the keyId (which is hashed) exists in the user's apiKeys array
    // The keyId in the URL is the hashed key (from the API key middleware context)
    const ownsKey = user.apiKeys?.includes(keyId);
    if (!ownsKey) {
      // Return 404 to not leak information about which keys exist
      return next(new AppError('API key not found', 404, 'API_KEY_NOT_FOUND'));
    }

    // ── Parse and validate query parameters ────────────────────────────────
    let from: Date | undefined;
    let to: Date | undefined;
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const endpointParam = req.query.endpoint as string | undefined;
    const granularityParam = (req.query.granularity as string | undefined)?.toLowerCase();
    const limitParam = parseInt(req.query.limit as string, 10) || undefined;
    const skipParam = parseInt(req.query.skip as string, 10) || undefined;

    if (fromParam) {
      from = new Date(fromParam);
      if (isNaN(from.getTime())) {
        return next(new AppError('Invalid "from" date format', 400, 'INVALID_FROM_DATE'));
      }
    }

    if (toParam) {
      to = new Date(toParam);
      if (isNaN(to.getTime())) {
        return next(new AppError('Invalid "to" date format', 400, 'INVALID_TO_DATE'));
      }
    }

    if (granularityParam && !['hour', 'day'].includes(granularityParam)) {
      return next(new AppError('Granularity must be "hour" or "day"', 400, 'INVALID_GRANULARITY'));
    }

    if (limitParam !== undefined && (limitParam < 1 || limitParam > 10000)) {
      return next(new AppError('Limit must be between 1 and 10000', 400, 'INVALID_LIMIT'));
    }

    if (skipParam !== undefined && skipParam < 0) {
      return next(new AppError('Skip must be non-negative', 400, 'INVALID_SKIP'));
    }

    // ── Query usage data ──────────────────────────────────────────────────
    const usage = await apiKeyUsageService.getUsageByKey(keyId, {
      from,
      to,
      endpoint: endpointParam,
      granularity: (granularityParam as 'hour' | 'day') || 'hour',
      limit: limitParam,
      skip: skipParam,
    });

    // ── Return formatted response ─────────────────────────────────────────
    res.status(200).json({
      success: true,
      data: usage,
    });
  } catch (error) {
    next(error);
  }
};

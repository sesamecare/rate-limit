import { ServiceExpress } from '@openapi-typescript-infra/service';
import type { RedisOptions, Redis } from 'ioredis';
import { IRateLimiterOptions, RateLimiterRedis, RateLimiterMemory, RateLimiterAbstract, IRateLimiterRes } from 'rate-limiter-flexible';

const FAIL: IRateLimiterRes = {
  remainingPoints: -1,
  consumedPoints: -1,
  isFirstInDuration: false,
  msBeforeNext: -1,
};

const PASS: IRateLimiterRes = {
  ...FAIL,
  remainingPoints: 1,
};

interface LimitOutcome<I extends string> {
  isLimited: boolean;
  causes?: I[];
}

type Result<I extends string> = Record<I, IRateLimiterRes | null>;

export class RateLimiters<I extends string> {
  instances: Record<I, RateLimiterAbstract>;

  constructor(
    private app: ServiceExpress,
    client: RedisOptions | Redis | 'memory',
    instances: Record<I, IRateLimiterOptions>,
    private opts?: { failOnError?: boolean; },
  ) {
    this.instances = {} as Record<I, RateLimiterAbstract>;
    for (const key in instances) {
      if (client === 'memory') {
        this.instances[key] = new RateLimiterMemory(instances[key]);
      } else {
        this.instances[key] = new RateLimiterRedis({
          storeClient: client,
          ...instances[key],
        });
      }
    }
  }

  async getRemainingPoints(ids: Record<I, string>): Promise<Result<I>> {
    const catcher = (error: Error): IRateLimiterRes => {
      this.app.locals.logger.error(error, 'Failed to get rate limit');
      if (this.opts?.failOnError) {
        return FAIL;
      }
      return PASS;
    };

    const points = {} as Result<I>;
    const promises: Promise<void>[] = [];
    for (const key in ids) {
      promises.push(this.instances[key]
        .get(ids[key])
        .catch(catcher)
        .then((result) => {
          points[key] = result;
        }));
    }
    await Promise.all(promises);
    return points;
  }

  async consume(ids: Record<I, string>, points = 1): Promise<Result<I>> {
    let errors: Error[] | undefined;

    const catcher = (error: Error | IRateLimiterRes) => {
      if (error instanceof Error) {
        this.app.locals.logger.error(error, 'Failed to consume towards rate limit');
        errors = errors || [];
        errors.push(error);
        return FAIL;
      }
      return error;
    };

    const results: Record<I, IRateLimiterRes | null> = {} as Record<I, IRateLimiterRes | null>;
    const promises: Promise<void>[] = [];
    for (const key in ids) {
      promises.push(this.instances[key]
        .consume(ids[key], points)
        .catch(catcher)
        .then((result) => {
          results[key] = result;
        }));
    }
    await Promise.all(promises);
    if (errors) {
      throw new Error('Failed to consume towards rate limit', { cause: errors });
    }
    return results;
  }

  async consumeAndCheckLimit(ids: Record<I, string>, points = 1): Promise<LimitOutcome<I>> {
    const results = await this.consume(ids, points);
    return RateLimiters.getLimitOutcome(results);
  }

  async isLimited(ids: Record<I, string>): Promise<LimitOutcome<I>> {
    const results = await this.getRemainingPoints(ids);
    return RateLimiters.getLimitOutcome(results);
  }

  static getLimitOutcome<I extends string>(results: Result<I>) {
    let causes: I[] | undefined;
    for (const key in results) {
      const rPoints = results[key]?.remainingPoints;
      if (rPoints !== undefined && rPoints !== null && rPoints <= 0) {
        causes = causes || [];
        causes.push(key);
      }
    }
    return {
      isLimited: !!causes,
      causes,
    };
  }
}
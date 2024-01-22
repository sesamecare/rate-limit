import { describe, expect, test } from 'vitest';
import { getReusableApp } from '@openapi-typescript-infra/service-tester';
import { useService } from '@openapi-typescript-infra/service';

import { RateLimiters } from '../src/index';

describe('Basic function', () => {
  test('should limit things', async () => {
    const key = `test-${Date.now()}`;
    const app = await getReusableApp({ name: 'test', service: useService, rootDirectory: __dirname });
    const rateLimiter = new RateLimiters(app, 'memory', {
      default: {
        points: 10,
        duration: 1,
        blockDuration: 1,
      },
    });

    const keys = { default: key };
    expect(rateLimiter.instances.default, 'should get a valid rate limiter').toBeDefined();
    let status = await rateLimiter.getRemainingPoints(keys);
    expect(status.default?.remainingPoints).toBeUndefined();
    expect((await rateLimiter.isLimited(keys)).isLimited).toBe(false);

    status = await rateLimiter.consume({ default: key });
    expect(status.default?.remainingPoints).toBe(9);

    status = await rateLimiter.getRemainingPoints(keys);
    expect(status.default?.remainingPoints).toBe(9);

    status = await rateLimiter.consume(keys, 9);
    expect(status.default?.remainingPoints).toBe(0);

    let limit = await rateLimiter.isLimited(keys);
    expect(limit.isLimited).toBe(true);
    expect(limit.causes).toEqual(['default']);

    limit = await rateLimiter.consumeAndCheckLimit(keys);
    expect(limit.isLimited).toBe(true);
    expect(limit.causes).toEqual(['default']);
  });
});

import * as core from '@actions/core';
import { logger } from './logger';

export class ActionError extends Error {
  constructor(
    message: string,
    public readonly step: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

export function handleError(error: unknown): never {
  if (error instanceof ActionError) {
    logger.error(`[${error.step}] ${error.message}`);
    if (error.cause) {
      logger.debug(`Caused by: ${error.cause.message}`);
    }
    core.setFailed(`Failed at step "${error.step}": ${error.message}`);
  } else if (error instanceof Error) {
    logger.error(error.message);
    core.setFailed(error.message);
  } else {
    const msg = String(error);
    logger.error(msg);
    core.setFailed(msg);
  }
  process.exit(1);
}

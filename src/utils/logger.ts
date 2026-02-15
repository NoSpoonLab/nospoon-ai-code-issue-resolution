import * as core from '@actions/core';

export const logger = {
  info(message: string): void {
    core.info(message);
  },

  debug(message: string): void {
    core.debug(message);
  },

  warning(message: string): void {
    core.warning(message);
  },

  error(message: string | Error): void {
    core.error(message);
  },

  group<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return core.group(name, fn);
  },
};

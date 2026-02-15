import Ajv from 'ajv';
import { crashReportSchema } from './schema';
import { CrashReportData } from '../types';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile<CrashReportData>(crashReportSchema);

export function parseAndValidateCrashReport(jsonString: string): CrashReportData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON: ${message}`);
  }

  if (!validate(parsed)) {
    const errors = validate.errors
      ?.map((err) => `${err.instancePath || '/'} ${err.message}`)
      .join('; ');
    throw new Error(`Crash report validation failed: ${errors}`);
  }

  return parsed;
}

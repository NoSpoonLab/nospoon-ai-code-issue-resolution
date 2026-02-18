import Ajv from 'ajv';
import { crashReportSchema } from './schema';
import { CrashReportData } from '../types';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile<CrashReportData>(crashReportSchema);

function parseJson(jsonString: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON: ${message}`);
  }
  return parsed;
}

export function parseAndValidateCrashReports(jsonString: string): CrashReportData[] {
  const parsed = parseJson(jsonString);
  const reports = Array.isArray(parsed) ? parsed : [parsed];

  if (reports.length === 0) {
    throw new Error('Crash report validation failed: expected at least 1 crash report');
  }

  reports.forEach((report, index) => {
    if (!validate(report)) {
      const errors = validate.errors
        ?.map((err) => `${err.instancePath || '/'} ${err.message}`)
        .join('; ');
      throw new Error(`Crash report validation failed at index ${index}: ${errors}`);
    }
  });

  return reports;
}

export function parseAndValidateCrashReport(jsonString: string): CrashReportData {
  return parseAndValidateCrashReports(jsonString)[0];
}

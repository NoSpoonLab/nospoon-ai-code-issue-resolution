import { CrashReportData, CrashThread, NativeCrash, ManagedException, LogMessage, UserMetadata } from '../types';

const LOG_TYPE_MAP: Record<number, string> = {
  0: 'Error',
  1: 'Assert',
  2: 'Warning',
  3: 'Log',
  4: 'Exception',
  5: 'Debug',
};

export function buildPrompt(
  report: CrashReportData,
  additionalPrompt?: string,
  relatedReports: CrashReportData[] = []
): string {
  const sections: string[] = [];

  sections.push('You are an expert Unity/C# developer analyzing a crash report from Unity Cloud Diagnostics / Backtrace.');
  sections.push('Your goal is to identify the root cause of the crash, find the relevant source files, and apply a proper, targeted fix. Do not refactor surrounding code or make changes unrelated to the crash.');
  sections.push('You may consult the internet for API docs, library behavior, or platform specifics if it helps the fix.\n');

  // Crash Report Summary
  sections.push('## Crash Report Summary\n');
  sections.push(`- **Report ID:** \`${report.report_id}\``);
  sections.push(`- **Hash:** \`${report.crash_report_hash}\``);
  sections.push(`- **Timestamp:** ${formatTimestamp(report.ts)}`);
  if (report.counter != null) {
    sections.push(`- **Occurrences:** ${report.counter}`);
  }
  sections.push('');

  // Application Info
  sections.push('## Application Info\n');
  sections.push(`- **Name:** ${report.project_name ?? report.name}`);
  sections.push(`- **Version:** ${report.version}`);
  if (report.app_build) sections.push(`- **Build:** ${report.app_build}`);
  if (report.platform) sections.push(`- **Platform:** ${report.platform}`);
  if (report.sdk_ver) sections.push(`- **SDK Version:** ${report.sdk_ver}`);
  if (report.scripting_backend) sections.push(`- **Scripting Backend:** ${report.scripting_backend}`);
  sections.push('');

  // Device Info
  const hasDeviceInfo = report.device_model || report.os || report.device_ram || report.cpu || report.gfx || report.screen_size;
  if (hasDeviceInfo) {
    sections.push('## Device Info\n');
    if (report.device_model) sections.push(`- **Model:** ${report.device_model}`);
    if (report.os) sections.push(`- **OS:** ${report.os}`);
    if (report.device_ram) sections.push(`- **RAM:** ${report.device_ram} MB`);
    if (report.cpu) sections.push(`- **CPU:** ${report.cpu}${report.cpu_count ? ` (${report.cpu_count} cores)` : ''}${report.cpu_freq ? ` @ ${report.cpu_freq} MHz` : ''}`);
    if (report.gfx) sections.push(`- **Graphics:** ${report.gfx}`);
    if (report.gpu_version) sections.push(`- **GPU Version:** ${report.gpu_version}`);
    if (report.gpu_vendor) sections.push(`- **GPU Vendor:** ${report.gpu_vendor}`);
    if (report.gpu_driver) sections.push(`- **GPU Driver:** ${report.gpu_driver}`);
    if (report.screen_size) sections.push(`- **Screen:** ${report.screen_size}${report.screen_dpi ? ` @ ${report.screen_dpi} DPI` : ''}`);
    if (report.system_language) sections.push(`- **Language:** ${report.system_language}`);
    sections.push('');
  }

  // Native Crash
  if (report.native_crash) {
    sections.push(formatNativeCrash(report.native_crash));
  }

  // Managed Exception
  if (report.managed_exception) {
    sections.push(formatManagedException(report.managed_exception));
  }

  // Log Messages
  if (report.log_messages && report.log_messages.length > 0) {
    sections.push(formatLogMessages(report.log_messages));
  }

  // User Metadata
  if (report.user_metadata && report.user_metadata.length > 0) {
    sections.push(formatUserMetadata(report.user_metadata));
  }

  if (relatedReports.length > 0) {
    sections.push(formatRelatedCrashReports(relatedReports));
  }

  // Instructions
  sections.push('## Instructions\n');
  sections.push('1. Search the codebase for files related to the crash (use class names, method names, and file names from the stack traces).');
  sections.push('2. Read and analyze those files to understand the context.');
  sections.push('3. Identify the root cause of the crash.');
  sections.push('4. Apply a minimal, targeted fix that prevents the crash without introducing regressions.');
  sections.push('5. Only modify files that are necessary for the fix.');
  sections.push('6. Follow existing code style and conventions.');
  sections.push('7. Do not run git commit/push commands and do not create pull requests; this workflow handles git and PR operations automatically.');
  sections.push('8. In your final analysis, include clear sections: Root Cause, Solution, Changes Made, and Test Plan.');

  if (additionalPrompt && additionalPrompt.trim()) {
    sections.push('\n## Additional Instructions\n');
    sections.push(additionalPrompt.trim());
  }

  return sections.join('\n');
}

export function formatTimestamp(ts: number): string {
  // Backtrace sends timestamps in milliseconds; detect and handle both ms and seconds
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toISOString();
}

export function formatHex(value: string | number | undefined): string {
  if (value == null) return 'N/A';
  if (typeof value === 'number') {
    return `0x${value.toString(16).toUpperCase()}`;
  }
  return value.startsWith('0x') ? value : `0x${value}`;
}

export function formatLogType(type: number | undefined): string {
  if (type == null) return 'Unknown';
  return LOG_TYPE_MAP[type] ?? `Type(${type})`;
}

export function formatCrashedThread(thread: CrashThread): string {
  const lines: string[] = [];
  lines.push(`### Crashed Thread #${thread.number}${thread.name ? ` (${thread.name})` : ''}\n`);
  lines.push('```');
  for (const frame of thread.frames) {
    const fn = frame.function_name ?? '<unknown>';
    const img = frame.image_name ?? '';
    const filePart = frame.file_name ? ` at ${frame.file_name}${frame.line_number != null ? `:${frame.line_number}` : ''}` : '';
    const pcPart = frame.relative_pc != null ? ` [${formatHex(frame.relative_pc)}]` : '';
    const managedTag = frame.managed ? ' [managed]' : '';
    lines.push(`  ${img} ${fn}${filePart}${pcPart}${managedTag}`);
  }
  lines.push('```\n');
  return lines.join('\n');
}

export function formatNativeCrash(crash: NativeCrash): string {
  const lines: string[] = [];
  lines.push('## Native Crash\n');

  if (crash.signal_name) lines.push(`- **Signal:** ${crash.signal_name}`);
  if (crash.signal_code) lines.push(`- **Code:** ${crash.signal_code}`);
  if (crash.signal_address) lines.push(`- **Address:** ${formatHex(crash.signal_address)}`);
  if (crash.signal_pc) lines.push(`- **PC:** ${formatHex(crash.signal_pc)}`);
  if (crash.symbolicated != null) lines.push(`- **Symbolicated:** ${crash.symbolicated ? 'Yes' : 'No'}`);
  lines.push('');

  const crashedThread = crash.threads.find((t) => t.crashed);
  if (crashedThread) {
    lines.push(formatCrashedThread(crashedThread));
  }

  const otherThreads = crash.threads.filter((t) => !t.crashed);
  if (otherThreads.length > 0) {
    lines.push('### Other Threads (top 5 frames each)\n');
    for (const thread of otherThreads) {
      lines.push(`**Thread #${thread.number}${thread.name ? ` (${thread.name})` : ''}**`);
      lines.push('```');
      const topFrames = thread.frames.slice(0, 5);
      for (const frame of topFrames) {
        const fn = frame.function_name ?? '<unknown>';
        const img = frame.image_name ?? '';
        lines.push(`  ${img} ${fn}`);
      }
      if (thread.frames.length > 5) {
        lines.push(`  ... (${thread.frames.length - 5} more frames)`);
      }
      lines.push('```\n');
    }
  }

  return lines.join('\n');
}

export function formatManagedException(exception: ManagedException): string {
  const lines: string[] = [];
  lines.push('## Managed Exception\n');
  lines.push(`- **Type:** \`${exception.type}\``);
  lines.push(`- **Message:** ${exception.message}`);
  lines.push('');
  lines.push('### Stack Trace\n');
  lines.push('```');
  lines.push(exception.stack_trace);
  lines.push('```\n');

  // Native thread info (IL2CPP native frames for this managed exception)
  if (exception.native_thread_info && exception.native_thread_info.frames.length > 0) {
    const nti = exception.native_thread_info;
    lines.push('### Native Thread Info (IL2CPP frames)\n');
    lines.push('```');
    for (const frame of nti.frames) {
      const fn = frame.function_name ?? '<unknown>';
      const img = frame.image_name ?? '';
      const pcPart = frame.relative_pc != null ? ` [${formatHex(frame.relative_pc)}]` : '';
      lines.push(`  ${img} ${fn}${pcPart}`);
    }
    lines.push('```\n');
  }

  return lines.join('\n');
}

export function formatLogMessages(messages: LogMessage[]): string {
  const lines: string[] = [];
  const last50 = messages.slice(-50);
  lines.push(`## Log Messages (last ${last50.length} of ${messages.length})\n`);
  lines.push('```');
  for (const msg of last50) {
    const ts = msg.ts != null ? `[${formatTimestamp(msg.ts)}]` : '';
    const type = `[${formatLogType(msg.type)}]`;
    lines.push(`${ts} ${type} ${msg.message}`);
  }
  lines.push('```\n');
  return lines.join('\n');
}

export function formatUserMetadata(metadata: UserMetadata[]): string {
  const lines: string[] = [];
  lines.push('## User Metadata\n');
  lines.push('| Key | Value |');
  lines.push('|-----|-------|');
  for (const entry of metadata) {
    lines.push(`| ${entry.key} | ${entry.value} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function formatRelatedCrashReports(reports: CrashReportData[]): string {
  const lines: string[] = [];
  lines.push(`## Related Crash Reports (${reports.length})\n`);

  for (const [index, report] of reports.entries()) {
    lines.push(`### Related Report #${index + 1}`);
    lines.push(`- **Report ID:** \`${report.report_id}\``);
    lines.push(`- **Hash:** \`${report.crash_report_hash}\``);
    lines.push(`- **Timestamp:** ${formatTimestamp(report.ts)}`);
    lines.push(`- **Version:** ${report.version}`);
    if (report.platform) lines.push(`- **Platform:** ${report.platform}`);
    if (report.device_model) lines.push(`- **Device:** ${report.device_model}`);
    if (report.os) lines.push(`- **OS:** ${report.os}`);
    if (report.managed_exception) {
      lines.push(`- **Managed Exception:** \`${report.managed_exception.type}\` - ${report.managed_exception.message}`);
    } else if (report.native_crash?.signal_name) {
      lines.push(`- **Native Signal:** ${report.native_crash.signal_name}`);
    } else {
      lines.push('- **Crash Type:** Unknown');
    }
    lines.push('');
  }

  const managedByType = new Map<string, number>();
  let nativeCount = 0;

  reports.forEach((report) => {
    if (report.managed_exception) {
      const key = report.managed_exception.type;
      managedByType.set(key, (managedByType.get(key) ?? 0) + 1);
      return;
    }
    if (report.native_crash) {
      nativeCount += 1;
    }
  });

  lines.push('### Cross-Report Patterns\n');
  if (managedByType.size === 0 && nativeCount === 0) {
    lines.push('- No explicit managed/native crash signatures found in related reports.');
  } else {
    managedByType.forEach((count, type) => {
      lines.push(`- Managed \`${type}\`: ${count}`);
    });
    if (nativeCount > 0) {
      lines.push(`- Native crash reports: ${nativeCount}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

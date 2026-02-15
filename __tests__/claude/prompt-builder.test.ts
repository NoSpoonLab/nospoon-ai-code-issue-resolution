import {
  buildPrompt,
  formatTimestamp,
  formatHex,
  formatLogType,
  formatCrashedThread,
  formatNativeCrash,
  formatManagedException,
  formatLogMessages,
  formatUserMetadata,
} from '../../src/claude/prompt-builder';
import { CrashReportData } from '../../src/types';

const fullReport: CrashReportData = {
  report_id: 'rpt-abc123',
  crash_report_hash: 'a1b2c3d4e5f6a7b8',
  ts: 1700000000,
  name: 'MyGame',
  version: '1.2.3',
  app_build: '100',
  platform: 'Android',
  sdk_ver: '2021.3.25f1',
  scripting_backend: 'il2cpp',
  device_model: 'Samsung Galaxy S21',
  device_ram: 8192,
  os: 'Android 13',
  cpu: 'ARM64',
  cpu_count: 8,
  gfx: 'Adreno 660',
  gpu_version: 'OpenGL ES 3.2',
  gpu_vendor: 'Qualcomm',
  gpu_driver: '512.530.0',
  screen_size: '2400x1080',
  native_crash: {
    signal_name: 'SIGSEGV',
    signal_code: 'SEGV_MAPERR',
    signal_address: '0x10',
    signal_pc: '0xabc123',
    symbolicated: true,
    threads: [
      {
        number: 0,
        name: 'Main Thread',
        crashed: true,
        frames: [
          {
            image_name: 'libil2cpp.so',
            function_name: 'PlayerManager::Update()',
            file_name: 'PlayerManager.cpp',
            line_number: 42,
            relative_pc: 0x12345,
            symbolication_successful: true,
            managed: false,
            is_user_image: true,
          },
        ],
      },
      {
        number: 1,
        name: 'Worker Thread',
        crashed: false,
        frames: [
          { image_name: 'libunity.so', function_name: 'Thread::Wait()' },
        ],
      },
    ],
  },
  managed_exception: {
    type: 'NullReferenceException',
    message: 'Object reference not set to an instance of an object',
    stack_trace: 'at PlayerManager.Update () [0x00012] in PlayerManager.cs:42',
  },
  log_messages: [
    { message: 'Loading player data...', ts: 1699999990, frame: 100, type: 3 },
    { message: 'NullReferenceException', ts: 1700000000, frame: 150, type: 0 },
  ],
  user_metadata: [
    { key: 'user_id', value: 'usr-12345' },
    { key: 'level', value: '7' },
  ],
  counter: 42,
};

describe('buildPrompt', () => {
  it('should include Unity/C# expert role', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('expert Unity/C# developer');
  });

  it('should include crash report summary', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## Crash Report Summary');
    expect(prompt).toContain('`rpt-abc123`');
    expect(prompt).toContain('`a1b2c3d4e5f6a7b8`');
    expect(prompt).toContain('**Occurrences:** 42');
  });

  it('should include application info', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## Application Info');
    expect(prompt).toContain('**Name:** MyGame');
    expect(prompt).toContain('**Version:** 1.2.3');
    expect(prompt).toContain('**Build:** 100');
    expect(prompt).toContain('**Platform:** Android');
    expect(prompt).toContain('**Scripting Backend:** il2cpp');
  });

  it('should include device info', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## Device Info');
    expect(prompt).toContain('**Model:** Samsung Galaxy S21');
    expect(prompt).toContain('**OS:** Android 13');
    expect(prompt).toContain('**RAM:** 8192 MB');
    expect(prompt).toContain('**CPU:** ARM64');
    expect(prompt).toContain('**Graphics:** Adreno 660');
    expect(prompt).toContain('**Screen:** 2400x1080');
  });

  it('should include native crash info', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## Native Crash');
    expect(prompt).toContain('**Signal:** SIGSEGV');
    expect(prompt).toContain('**Code:** SEGV_MAPERR');
    expect(prompt).toContain('Crashed Thread #0 (Main Thread)');
    expect(prompt).toContain('PlayerManager::Update()');
  });

  it('should include managed exception', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## Managed Exception');
    expect(prompt).toContain('`NullReferenceException`');
    expect(prompt).toContain('Object reference not set');
    expect(prompt).toContain('PlayerManager.cs:42');
  });

  it('should include log messages', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## Log Messages');
    expect(prompt).toContain('[Log] Loading player data...');
    expect(prompt).toContain('[Error] NullReferenceException');
  });

  it('should include user metadata', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## User Metadata');
    expect(prompt).toContain('| user_id | usr-12345 |');
    expect(prompt).toContain('| level | 7 |');
  });

  it('should include instructions', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).toContain('## Instructions');
    expect(prompt).toContain('root cause');
    expect(prompt).toContain('proper, targeted fix');
  });

  it('should append additional prompt when provided', () => {
    const prompt = buildPrompt(fullReport, 'Always check for null references before accessing dictionaries.');
    expect(prompt).toContain('## Additional Instructions');
    expect(prompt).toContain('Always check for null references before accessing dictionaries.');
  });

  it('should not include additional instructions section when additional prompt is empty', () => {
    const prompt = buildPrompt(fullReport, '');
    expect(prompt).not.toContain('## Additional Instructions');
  });

  it('should not include additional instructions section when additional prompt is undefined', () => {
    const prompt = buildPrompt(fullReport);
    expect(prompt).not.toContain('## Additional Instructions');
  });

  it('should handle minimal crash report', () => {
    const minimal: CrashReportData = {
      report_id: 'rpt-001',
      crash_report_hash: 'abcdef1234567890',
      ts: 1700000000,
      name: 'MyGame',
      version: '1.0.0',
    };
    const prompt = buildPrompt(minimal);
    expect(prompt).toContain('## Crash Report Summary');
    expect(prompt).toContain('MyGame');
    expect(prompt).not.toContain('## Device Info');
    expect(prompt).not.toContain('## Native Crash');
    expect(prompt).not.toContain('## Managed Exception');
    expect(prompt).not.toContain('## Log Messages');
    expect(prompt).not.toContain('## User Metadata');
  });

  it('should not include device info when no device fields present', () => {
    const report: CrashReportData = {
      report_id: 'rpt-001',
      crash_report_hash: 'abc',
      ts: 1,
      name: 'G',
      version: '1',
      platform: 'iOS',
    };
    const prompt = buildPrompt(report);
    expect(prompt).not.toContain('## Device Info');
  });
});

describe('formatTimestamp', () => {
  it('should convert unix timestamp in seconds to ISO string', () => {
    const result = formatTimestamp(1700000000);
    expect(result).toBe('2023-11-14T22:13:20.000Z');
  });

  it('should handle timestamps in milliseconds (Backtrace format)', () => {
    const result = formatTimestamp(1770946539828);
    expect(result).toContain('2026-');
  });
});

describe('formatHex', () => {
  it('should return value as-is if already prefixed with 0x', () => {
    expect(formatHex('0xABC')).toBe('0xABC');
  });

  it('should add 0x prefix if missing', () => {
    expect(formatHex('ABC')).toBe('0xABC');
  });

  it('should convert number to hex string', () => {
    expect(formatHex(80269168)).toBe('0x4C8CF70');
  });

  it('should return N/A for undefined', () => {
    expect(formatHex(undefined)).toBe('N/A');
  });
});

describe('formatLogType', () => {
  it('should map known types', () => {
    expect(formatLogType(0)).toBe('Error');
    expect(formatLogType(1)).toBe('Assert');
    expect(formatLogType(2)).toBe('Warning');
    expect(formatLogType(3)).toBe('Log');
    expect(formatLogType(4)).toBe('Exception');
    expect(formatLogType(5)).toBe('Debug');
  });

  it('should handle unknown type', () => {
    expect(formatLogType(99)).toBe('Type(99)');
  });

  it('should handle undefined', () => {
    expect(formatLogType(undefined)).toBe('Unknown');
  });
});

describe('formatCrashedThread', () => {
  it('should format crashed thread with all frame details', () => {
    const result = formatCrashedThread({
      number: 0,
      name: 'Main Thread',
      crashed: true,
      frames: [
        {
          image_name: 'libil2cpp.so',
          function_name: 'Foo::Bar()',
          file_name: 'Foo.cpp',
          line_number: 10,
          relative_pc: 256,
          managed: true,
        },
      ],
    });
    expect(result).toContain('Crashed Thread #0 (Main Thread)');
    expect(result).toContain('libil2cpp.so Foo::Bar()');
    expect(result).toContain('at Foo.cpp:10');
    expect(result).toContain('[0x100]'); // 256 in hex
    expect(result).toContain('[managed]');
  });
});

describe('formatNativeCrash', () => {
  it('should include signal info and crashed thread', () => {
    const result = formatNativeCrash({
      signal_name: 'SIGABRT',
      symbolicated: false,
      threads: [
        { number: 0, crashed: true, frames: [{ function_name: 'abort' }] },
      ],
    });
    expect(result).toContain('**Signal:** SIGABRT');
    expect(result).toContain('**Symbolicated:** No');
    expect(result).toContain('abort');
  });

  it('should show other threads condensed', () => {
    const frames = Array.from({ length: 8 }, (_, i) => ({
      function_name: `func_${i}`,
      image_name: 'lib.so',
    }));
    const result = formatNativeCrash({
      threads: [
        { number: 0, crashed: false, frames },
      ],
    });
    expect(result).toContain('Other Threads');
    expect(result).toContain('func_0');
    expect(result).toContain('func_4');
    expect(result).toContain('3 more frames');
    expect(result).not.toContain('func_5');
  });
});

describe('formatManagedException', () => {
  it('should format exception with type, message, and stack trace', () => {
    const result = formatManagedException({
      type: 'ArgumentException',
      message: 'Value cannot be null',
      stack_trace: 'at System.String.Format()',
    });
    expect(result).toContain('`ArgumentException`');
    expect(result).toContain('Value cannot be null');
    expect(result).toContain('System.String.Format()');
  });
});

describe('formatLogMessages', () => {
  it('should limit to last 50 messages', () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      message: `msg_${i}`,
      type: 3,
    }));
    const result = formatLogMessages(messages);
    expect(result).toContain('last 50 of 60');
    expect(result).not.toContain('msg_0');
    expect(result).toContain('msg_10');
    expect(result).toContain('msg_59');
  });
});

describe('formatUserMetadata', () => {
  it('should format as markdown table', () => {
    const result = formatUserMetadata([
      { key: 'env', value: 'production' },
    ]);
    expect(result).toContain('| Key | Value |');
    expect(result).toContain('| env | production |');
  });
});

import { parseAndValidateCrashReport, parseAndValidateCrashReports } from '../../src/input/validator';

const validCrashReport = {
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
    signal_address: '0x0000000000000010',
    signal_pc: '0x00000071abc12345',
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
          {
            image_name: 'libunity.so',
            function_name: 'Thread::Wait()',
          },
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

describe('parseAndValidateCrashReport', () => {
  it('should parse and return valid crash report with all fields', () => {
    const result = parseAndValidateCrashReport(JSON.stringify(validCrashReport));
    expect(result).toEqual(validCrashReport);
  });

  it('should parse a JSON array of crash reports', () => {
    const secondReport = {
      ...validCrashReport,
      report_id: 'rpt-abc124',
      crash_report_hash: 'b1b2c3d4e5f6a7b8',
    };
    const result = parseAndValidateCrashReports(JSON.stringify([validCrashReport, secondReport]));
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(validCrashReport);
    expect(result[1]).toEqual(secondReport);
  });

  it('should throw when crash report array is empty', () => {
    expect(() => parseAndValidateCrashReports('[]')).toThrow('expected at least 1 crash report');
  });

  it('should accept minimal valid crash report', () => {
    const minimal = {
      report_id: 'rpt-001',
      crash_report_hash: 'abcdef1234567890',
      ts: 1700000000,
      name: 'MyGame',
      version: '1.0.0',
    };
    const result = parseAndValidateCrashReport(JSON.stringify(minimal));
    expect(result).toEqual(minimal);
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseAndValidateCrashReport('not json')).toThrow('Invalid JSON');
  });

  it('should throw when report_id is missing', () => {
    const data = { crash_report_hash: 'abc', ts: 1, name: 'G', version: '1' };
    expect(() => parseAndValidateCrashReport(JSON.stringify(data))).toThrow(
      'validation failed'
    );
  });

  it('should throw when crash_report_hash is missing', () => {
    const data = { report_id: 'rpt', ts: 1, name: 'G', version: '1' };
    expect(() => parseAndValidateCrashReport(JSON.stringify(data))).toThrow(
      'validation failed'
    );
  });

  it('should throw when name is missing', () => {
    const data = { report_id: 'rpt', crash_report_hash: 'abc', ts: 1, version: '1' };
    expect(() => parseAndValidateCrashReport(JSON.stringify(data))).toThrow(
      'validation failed'
    );
  });

  it('should throw when version is missing', () => {
    const data = { report_id: 'rpt', crash_report_hash: 'abc', ts: 1, name: 'G' };
    expect(() => parseAndValidateCrashReport(JSON.stringify(data))).toThrow(
      'validation failed'
    );
  });

  it('should throw when ts is missing', () => {
    const data = { report_id: 'rpt', crash_report_hash: 'abc', name: 'G', version: '1' };
    expect(() => parseAndValidateCrashReport(JSON.stringify(data))).toThrow(
      'validation failed'
    );
  });

  it('should throw on additional properties', () => {
    const data = {
      report_id: 'rpt',
      crash_report_hash: 'abc',
      ts: 1,
      name: 'G',
      version: '1',
      unknown_field: 'value',
    };
    expect(() => parseAndValidateCrashReport(JSON.stringify(data))).toThrow(
      'validation failed'
    );
  });

  it('should throw on empty report_id', () => {
    const data = {
      report_id: '',
      crash_report_hash: 'abc',
      ts: 1,
      name: 'G',
      version: '1',
    };
    expect(() => parseAndValidateCrashReport(JSON.stringify(data))).toThrow(
      'validation failed'
    );
  });

  it('should accept valid native_crash structure', () => {
    const data = {
      report_id: 'rpt',
      crash_report_hash: 'abc',
      ts: 1,
      name: 'G',
      version: '1',
      native_crash: {
        signal_name: 'SIGSEGV',
        threads: [{ number: 0, crashed: true, frames: [] }],
      },
    };
    const result = parseAndValidateCrashReport(JSON.stringify(data));
    expect(result.native_crash?.signal_name).toBe('SIGSEGV');
  });

  it('should accept valid managed_exception structure', () => {
    const data = {
      report_id: 'rpt',
      crash_report_hash: 'abc',
      ts: 1,
      name: 'G',
      version: '1',
      managed_exception: {
        type: 'NullReferenceException',
        message: 'Object reference not set',
        stack_trace: 'at Foo.Bar()',
      },
    };
    const result = parseAndValidateCrashReport(JSON.stringify(data));
    expect(result.managed_exception?.type).toBe('NullReferenceException');
  });

  it('should accept crash report with neither native_crash nor managed_exception', () => {
    const data = {
      report_id: 'rpt',
      crash_report_hash: 'abc',
      ts: 1,
      name: 'G',
      version: '1',
    };
    const result = parseAndValidateCrashReport(JSON.stringify(data));
    expect(result.native_crash).toBeUndefined();
    expect(result.managed_exception).toBeUndefined();
  });
});

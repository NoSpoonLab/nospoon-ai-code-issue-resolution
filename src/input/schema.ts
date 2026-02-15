import { CrashReportData } from '../types';

const stackFrameSchema = {
  type: 'object' as const,
  properties: {
    image_uuid: { type: 'string' as const, nullable: true },
    image_name: { type: 'string' as const, nullable: true },
    image_base_address: { type: 'number' as const, nullable: true },
    pdb_name: { type: 'string' as const, nullable: true },
    function_name: { type: 'string' as const, nullable: true },
    file_name: { type: 'string' as const, nullable: true },
    line_number: { type: 'integer' as const, nullable: true },
    absolute_pc: { type: 'number' as const, nullable: true },
    relative_pc: { type: 'number' as const, nullable: true },
    symbolication_successful: { type: 'boolean' as const, nullable: true },
    managed: { type: 'boolean' as const, nullable: true },
    managed_frame_desc: { type: 'string' as const, nullable: true },
    is_user_image: { type: 'boolean' as const, nullable: true },
    is_inlined: { type: 'boolean' as const, nullable: true },
  },
  additionalProperties: false,
};

const crashThreadSchema = {
  type: 'object' as const,
  properties: {
    number: { type: 'integer' as const },
    name: { type: 'string' as const, nullable: true },
    crashed: { type: 'boolean' as const },
    frames: {
      type: 'array' as const,
      items: stackFrameSchema,
    },
  },
  required: ['number', 'crashed', 'frames'] as const,
  additionalProperties: false,
};

const nativeCrashSchema = {
  type: 'object' as const,
  properties: {
    signal_name: { type: 'string' as const, nullable: true },
    signal_code: { type: 'string' as const, nullable: true },
    signal_address: { type: 'string' as const, nullable: true },
    signal_pc: { type: 'string' as const, nullable: true },
    symbolicated: { type: 'boolean' as const, nullable: true },
    threads: {
      type: 'array' as const,
      items: crashThreadSchema,
    },
  },
  required: ['threads'] as const,
  additionalProperties: false,
};

const managedExceptionSchema = {
  type: 'object' as const,
  properties: {
    type: { type: 'string' as const, minLength: 1 },
    message: { type: 'string' as const, minLength: 1 },
    stack_trace: { type: 'string' as const, minLength: 1 },
    native_thread_info: { ...crashThreadSchema, nullable: true },
  },
  required: ['type', 'message', 'stack_trace'] as const,
  additionalProperties: false,
};

const logMessageSchema = {
  type: 'object' as const,
  properties: {
    message: { type: 'string' as const },
    ts: { type: 'number' as const, nullable: true },
    frame: { type: 'integer' as const, nullable: true },
    type: { type: 'integer' as const, nullable: true },
  },
  required: ['message'] as const,
  additionalProperties: false,
};

const userMetadataSchema = {
  type: 'object' as const,
  properties: {
    key: { type: 'string' as const, minLength: 1 },
    value: { type: 'string' as const },
  },
  required: ['key', 'value'] as const,
  additionalProperties: false,
};

export const crashReportSchema = {
  type: 'object' as const,
  properties: {
    // Required
    report_id: { type: 'string' as const, minLength: 1 },
    crash_report_hash: { type: 'string' as const, minLength: 1 },
    ts: { type: 'number' as const },
    name: { type: 'string' as const, minLength: 1 },
    version: { type: 'string' as const, minLength: 1 },

    // Application info
    app_build: { type: 'string' as const, nullable: true },
    platform: { type: 'string' as const, nullable: true },
    platformid: { type: 'integer' as const, nullable: true },
    sdk_ver: { type: 'string' as const, nullable: true },
    scripting_backend: { type: 'string' as const, nullable: true },
    build_guid: { type: 'string' as const, nullable: true },
    build_tags: { type: 'array' as const, items: { type: 'string' as const }, nullable: true },
    project_name: { type: 'string' as const, nullable: true },
    appid: { type: 'string' as const, nullable: true },
    localprojectid: { type: 'string' as const, nullable: true },

    // Install info
    install_mode: { type: 'string' as const, nullable: true },
    install_store: { type: 'string' as const, nullable: true },

    // Client info
    client_report_id: { type: 'string' as const, nullable: true },
    client_ts: { type: 'number' as const, nullable: true },
    user_agent: { type: 'string' as const, nullable: true },
    sessionid: { type: 'number' as const, nullable: true },
    installation_id: { type: 'string' as const, nullable: true },

    // Device info
    device_model: { type: 'string' as const, nullable: true },
    device_ram: { type: 'number' as const, nullable: true },
    device_type: { type: 'integer' as const, nullable: true },
    device_vram: { type: 'integer' as const, nullable: true },
    device_info_flags: { type: 'number' as const, nullable: true },
    debug_device: { type: 'boolean' as const, nullable: true },
    rooted_or_jailbroken: { type: 'boolean' as const, nullable: true },

    // OS
    os: { type: 'string' as const, nullable: true },
    os_family: { type: 'integer' as const, nullable: true },
    system_language: { type: 'string' as const, nullable: true },

    // CPU
    cpu: { type: 'string' as const, nullable: true },
    cpu_count: { type: 'integer' as const, nullable: true },
    cpu_freq: { type: 'integer' as const, nullable: true },

    // GPU
    gfx: { type: 'string' as const, nullable: true },
    gpu_version: { type: 'string' as const, nullable: true },
    gpu_vendor: { type: 'string' as const, nullable: true },
    gpu_vendor_id: { type: 'integer' as const, nullable: true },
    gpu_device_id: { type: 'integer' as const, nullable: true },
    gpu_driver: { type: 'string' as const, nullable: true },
    gpu_api: { type: 'integer' as const, nullable: true },
    gpu_caps: { type: 'number' as const, nullable: true },
    gpu_shader_caps: { type: 'integer' as const, nullable: true },
    gpu_copy_texture_support: { type: 'integer' as const, nullable: true },
    gpu_render_texture_support: { type: 'integer' as const, nullable: true },
    gpu_texture_format_support: { type: 'integer' as const, nullable: true },
    gpu_supported_render_target_count: { type: 'integer' as const, nullable: true },
    gpu_max_cubemap_size: { type: 'integer' as const, nullable: true },
    gpu_max_texture_size: { type: 'integer' as const, nullable: true },

    // Screen
    screen_size: { type: 'string' as const, nullable: true },
    screen_dpi: { type: 'number' as const, nullable: true },
    screen_orientation: { type: 'integer' as const, nullable: true },
    refresh_rate: { type: 'number' as const, nullable: true },
    is_fullscreen: { type: 'boolean' as const, nullable: true },

    // Sensors
    sensor_flags: { type: 'integer' as const, nullable: true },

    // VR
    enabled_vr_devices: { type: 'array' as const, items: { type: 'string' as const }, nullable: true },
    vr_device_name: { type: 'string' as const, nullable: true },
    vr_device_model: { type: 'string' as const, nullable: true },
    is_wsar_remote: { type: 'boolean' as const, nullable: true },
    is_ar_app: { type: 'boolean' as const, nullable: true },

    // Runtime
    is_editor: { type: 'boolean' as const, nullable: true },
    logs_supported: { type: 'boolean' as const, nullable: true },

    // Crash data
    native_crash: { ...nativeCrashSchema, nullable: true },
    managed_exception: { ...managedExceptionSchema, nullable: true },
    log_messages: {
      type: 'array' as const,
      items: logMessageSchema,
      nullable: true,
    },
    user_metadata: {
      type: 'array' as const,
      items: userMetadataSchema,
      nullable: true,
    },
    counter: { type: 'integer' as const, nullable: true },
  },
  required: ['report_id', 'crash_report_hash', 'ts', 'name', 'version'] as const,
  additionalProperties: false,
};

// Type assertion to keep CrashReportData in sync — if this import breaks, the schema is out of date
const _typeCheck: CrashReportData = undefined as never;
void _typeCheck;

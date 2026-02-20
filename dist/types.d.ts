export interface StackFrame {
    image_uuid?: string;
    image_name?: string;
    image_base_address?: number;
    pdb_name?: string;
    function_name?: string;
    file_name?: string;
    line_number?: number;
    absolute_pc?: number;
    relative_pc?: number;
    symbolication_successful?: boolean;
    managed?: boolean;
    managed_frame_desc?: string;
    is_user_image?: boolean;
    is_inlined?: boolean;
}
export interface CrashThread {
    number: number;
    name?: string;
    crashed: boolean;
    frames: StackFrame[];
}
export interface NativeCrash {
    signal_name?: string;
    signal_code?: string;
    signal_address?: string | number;
    signal_pc?: string | number;
    symbolicated?: boolean;
    threads: CrashThread[];
}
export interface ManagedException {
    type: string;
    message: string;
    stack_trace: string;
    native_thread_info?: CrashThread;
}
export interface LogMessage {
    message: string;
    ts?: number;
    frame?: number;
    type?: number;
}
export interface UserMetadata {
    key: string;
    value: string;
}
export interface CrashReportData {
    report_id: string;
    crash_report_hash: string;
    ts: number;
    name: string;
    version: string;
    app_build?: string;
    platform?: string;
    platformid?: number;
    sdk_ver?: string;
    scripting_backend?: string;
    build_guid?: string;
    build_tags?: string[];
    project_name?: string;
    appid?: string;
    localprojectid?: string;
    install_mode?: string;
    install_store?: string;
    client_report_id?: string;
    client_ts?: number;
    user_agent?: string;
    sessionid?: number;
    installation_id?: string;
    device_model?: string;
    device_ram?: number;
    device_type?: number;
    device_vram?: number;
    device_info_flags?: number;
    debug_device?: boolean;
    rooted_or_jailbroken?: boolean;
    os?: string;
    os_family?: number;
    system_language?: string;
    cpu?: string;
    cpu_count?: number;
    cpu_freq?: number;
    gfx?: string;
    gpu_version?: string;
    gpu_vendor?: string;
    gpu_vendor_id?: number;
    gpu_device_id?: number;
    gpu_driver?: string;
    gpu_api?: number;
    gpu_caps?: number;
    gpu_shader_caps?: number;
    gpu_copy_texture_support?: number;
    gpu_render_texture_support?: number;
    gpu_texture_format_support?: number;
    gpu_supported_render_target_count?: number;
    gpu_max_cubemap_size?: number;
    gpu_max_texture_size?: number;
    screen_size?: string;
    screen_dpi?: number;
    screen_orientation?: number;
    refresh_rate?: number;
    is_fullscreen?: boolean;
    sensor_flags?: number;
    enabled_vr_devices?: string[];
    vr_device_name?: string;
    vr_device_model?: string;
    is_wsar_remote?: boolean;
    is_ar_app?: boolean;
    is_editor?: boolean;
    logs_supported?: boolean;
    native_crash?: NativeCrash | null;
    managed_exception?: ManagedException | null;
    log_messages?: LogMessage[];
    user_metadata?: UserMetadata[];
    counter?: number;
}
export type FixStrategy = 'minimal' | 'refactor' | 'aggressive';
export interface ActionInputs {
    crashReport: CrashReportData;
    crashReports: CrashReportData[];
    anthropicApiKey: string;
    githubToken: string;
    baseBranch: string;
    branchPrefix: string;
    maxTurns: number;
    allowedTools: string[];
    blockedDirectories: string[];
    prLabels: string[];
    dryRun: boolean;
    useRouter: boolean;
    routerRulesJson: string;
    routerMode: 'first-match' | 'fanout';
    routerDefaultTargetJson: string;
    fixStrategy: FixStrategy;
    additionalPrompt: string;
}
export interface ClaudeOutput {
    result: string;
    session_id: string;
    cost_usd: number;
    is_error: boolean;
    total_tokens_in: number;
    total_tokens_out: number;
}
export interface GitDiffResult {
    modifiedFiles: string[];
    newFiles: string[];
    hasChanges: boolean;
}
export interface PullRequestResult {
    url: string;
    number: number;
    branch: string;
}
export interface ActionResult {
    success: boolean;
    pr?: PullRequestResult;
    analysis: string;
    filesChanged: string[];
    costUsd: number;
    error?: string;
}

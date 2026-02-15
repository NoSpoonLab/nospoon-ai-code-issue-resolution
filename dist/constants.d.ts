export declare const DEFAULTS: {
    readonly BRANCH_PREFIX: "fix/crash-";
    readonly MAX_TURNS: 100;
    readonly ALLOWED_TOOLS: readonly ["Read", "Edit", "Write", "Bash", "Grep", "Glob", "WebSearch", "WebFetch"];
    readonly PR_LABELS: readonly ["crash-fix", "auto-generated"];
    readonly DRY_RUN: false;
};
/** @deprecated npm installation is deprecated. Use native install instead. */
export declare const CLAUDE_CLI_PACKAGE = "@anthropic-ai/claude-code";
export declare const CLAUDE_INSTALL_URL_UNIX = "https://claude.ai/install.sh";
export declare const CLAUDE_INSTALL_URL_WINDOWS = "https://claude.ai/install.cmd";
export declare const BRANCH_NAME_MAX_LENGTH = 100;
export declare const COMMIT_MESSAGE_PREFIX = "fix(crash): ";
export declare const PR_BODY_TEMPLATE: string;

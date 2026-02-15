export declare class ActionError extends Error {
    readonly step: string;
    readonly cause?: Error | undefined;
    constructor(message: string, step: string, cause?: Error | undefined);
}
export declare function handleError(error: unknown): never;

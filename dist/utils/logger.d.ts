export declare const logger: {
    info(message: string): void;
    debug(message: string): void;
    warning(message: string): void;
    error(message: string | Error): void;
    group<T>(name: string, fn: () => Promise<T>): Promise<T>;
};

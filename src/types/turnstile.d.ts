interface TurnstileRenderOptions {
    sitekey: string;
    action?: string;
    cData?: string;
    callback?: (token: string) => void;
    "error-callback"?: (code: string) => void;
    "expired-callback"?: () => void;
    theme?: "light" | "dark" | "auto";
    tabindex?: number;
}

interface TurnstileObject {
    render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
    reset: (widgetId?: string) => void;
    remove: (widgetId?: string) => void;
    getResponse: (widgetId?: string) => string | undefined;
}

declare global {
    interface Window {
        turnstile?: TurnstileObject;
    }
}

export { };

// Global typings for the hCaptcha browser API
// Reference: https://docs.hcaptcha.com/configuration/

export {};

declare global {
  interface HCaptchaRenderParams {
    sitekey: string;
    size?: "normal" | "compact" | "invisible";
    theme?: "light" | "dark";
    callback?: (token: string) => void;
    "expired-callback"?: () => void;
    "error-callback"?: () => void;
    [key: string]: any;
  }

  interface HCaptcha {
    render(container: string | HTMLElement, params: HCaptchaRenderParams): number;
    reset(widgetId?: number): void;
    getResponse(widgetId?: number): string;
    getRespKey?(widgetId?: number): string;
    execute(
      widgetId?: number,
      options?: { async?: boolean }
    ): Promise<{ response: string; key: string }> | void;
  }

  interface Window {
    hcaptcha?: HCaptcha;
  }
}

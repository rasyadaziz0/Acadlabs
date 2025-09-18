declare module 'busboy' {
  interface BusboyConfig {
    headers: Record<string, string | string[] | undefined>;
    limits?: {
      fileSize?: number;
      files?: number;
      fields?: number;
      fieldSize?: number;
    };
  }

  interface FileInfo {
    filename: string;
    mimeType: string;
    encoding?: string;
  }

  interface FieldInfo {
    nameTruncated?: boolean;
    valueTruncated?: boolean;
    encoding: string;
    mimeType: string;
  }

  type BusboyInstance = NodeJS.WritableStream & NodeJS.EventEmitter & {
    on(event: 'file', listener: (name: string, file: NodeJS.ReadableStream, info: FileInfo) => void): BusboyInstance;
    on(event: 'field', listener: (name: string, value: string, info?: FieldInfo) => void): BusboyInstance;
    on(event: 'filesLimit', listener: () => void): BusboyInstance;
    on(event: 'error', listener: (err: unknown) => void): BusboyInstance;
    on(event: 'finish', listener: () => void): BusboyInstance;
    /** Generic on() overload */
    on(event: string, listener: (...args: unknown[]) => void): BusboyInstance;
  };

  function Busboy(config: BusboyConfig): BusboyInstance;

  export = Busboy;
}

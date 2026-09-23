export class AppError extends Error {
  public data: unknown = null;
  public name: string = 'APP_ERROR';
  public status: number = 400;

  constructor(message: string, data: unknown = null) {
    super();
    this.message = message;
    this.data = data;
  }

  public get error(): { message: string; data: unknown } {
    return {
      message: this.message, data: this.data 
    };
  }
}

export class BadRequest extends AppError {
  public status: number = 400;
  public name: string = 'BAD_REQUEST!';

  constructor(message?: string, data: unknown = null) {
    super(message ?? 'BadRequest !', data);
  }
}

export class Unauthorized extends AppError {
  public status: number = 401;
  public name: string = 'UNAUTHORIZED';

  constructor(message?: string, data: unknown = null) {
    super(message ?? 'Unauthorized !', data);
  }
}const subMessagePrefix = `\n\t-- `;

export class ErrorHandler extends Error {
  protected constructor() {
    super();
  }
}

export class EnvironmentError extends ErrorHandler {
  public errors: null | ErrorHandler[] = null;
  public status: number | null = null;
  public name: string = 'ENV_ERROR';

  constructor();

  constructor(message: string);

  constructor(message?: string) {
    super();
    this.message = `Something went wrong with the environment currently running environment.${subMessagePrefix}${message}`;
  }
}


export class Forbidden extends AppError {
  public status: number = 403;
  public name: string = 'FORBIDDEN';

  constructor(message?: string, data: unknown = null) {
    super(message ?? 'Permission denied!', data);
  }
}


export class Unexpected extends AppError {
  public status: number = 400;

  constructor(message?: string, data: unknown = null) {
    super(message ?? 'Unexpected error!', data);
  }
}

interface Issue {
  validation?: string;
  code?: string;
  message?: string;
  path?: string[];
  expected?: string;
  received?: string;
}

export class ValidationFailed extends AppError {
  public status: number = 422;
  public name: string = 'VALIDATION_FAILED';
  public issues: Issue[] | null | undefined = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(errors: any = null, message?: string) {
    super(message ?? 'Validation error!', errors);
    if (errors?.issues) {
      this.issues = errors.issues;
    }
  }
}
export class NotFound extends AppError {
  public status: number = 404;
  public name: string = 'NOT_FOUND';

  constructor(message?: string, data: unknown = null) {
    super(message ?? 'Resource not found!', data);
  }
}
export class UnknownError extends AppError {
  public status: number = 514;

  constructor(message?: string, data: unknown = null) {
    super(message ?? 'UnknownError error!', data);
  }
}

export class Conflict extends AppError {
  public status: number = 409;
  public name: string = 'CONFLICT';

  constructor(message?: string, data: unknown = null) {
    super(message ?? 'Resource already exists!', data);
  }
}
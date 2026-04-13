export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "INTERNAL_ERROR",
    public readonly expose = statusCode < 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "The requested operation conflicts with current state.") {
    super(message, 409, "CONFLICT");
  }
}

export function toPublicError(error: unknown): { statusCode: number; body: { error: string; code: string } } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.expose ? error.message : "Unexpected server error.",
        code: error.code
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: "Unexpected server error.",
      code: "INTERNAL_ERROR"
    }
  };
}

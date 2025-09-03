// class CustomError extends Error {
//   constructor(message, statusCode) {
//     super(message);
//     this.statusCode = statusCode;
//     // this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
//     this.status = getStatus(statusCode);
//     Error.captureStackTrace(this, this.constructor);
//   }
// }

class CustomError extends Error {
  constructor(message, statusCode, code = 'INTERNAL_ERROR', meta = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code;
    if (meta) this.meta = meta; // optional extra context for logs
    Error.captureStackTrace(this, this.constructor);
  }
}


// More granular classification for status
const getStatus = (statusCode) => {
  if (statusCode >= 400 && statusCode < 500) {
    if (statusCode === 418) {
      return 'custom';  // Special case for teapot
    }
    return 'fail';
  } else if (statusCode >= 500 && statusCode < 600) {
    return 'error';
  } else {
    return 'unknown';  // For non-4xx, non-5xx status codes
  }
};

class ConflictError extends CustomError {
  constructor(message = 'Conflict occurred') {
    super(message, 409);
  }
}

class ValidationError extends CustomError {
  constructor(code = 'VALIDATION_FAILED', message = 'Validation failed', meta) {
    super(message, 422, code, meta);
  }
}

class NotFoundError extends CustomError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class AuthError extends CustomError {
  constructor(code = 'AUTH_ERROR', message = 'Unauthorized') {
    super(message, 401);
    this.code = code;
  }
}

class ForbiddenError extends CustomError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class RateLimitError extends CustomError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

class ServiceUnavailableError extends CustomError {
  constructor(message = 'Service unavailable') {
    super(message, 503);
  }
}

export {
  CustomError,
  ConflictError,
  ValidationError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  RateLimitError,
  ServiceUnavailableError,
};

// export default CustomError;

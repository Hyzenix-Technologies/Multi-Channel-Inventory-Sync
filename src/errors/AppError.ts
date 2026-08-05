export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class MappingNotFoundError extends AppError {
  constructor() {
    super(404, "MAPPING_NOT_FOUND", "No inventory mapping exists for this channel SKU");
  }
}

export class InsufficientStockError extends AppError {
  constructor(available: number, requestedChange: number) {
    super(409, "INSUFFICIENT_STOCK", "Insufficient stock for this sale", {
      available,
      requestedChange,
    });
  }
}

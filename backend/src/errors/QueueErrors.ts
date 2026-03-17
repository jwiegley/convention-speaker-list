export class QueueError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'QueueError';
  }
}

export class QueueFullError extends QueueError {
  constructor(message: string = 'Queue is at maximum capacity') {
    super(message, 'QUEUE_FULL', 400);
    this.name = 'QueueFullError';
  }
}

export class InvalidPositionError extends QueueError {
  constructor(position: number) {
    super(`Invalid queue position: ${position}`, 'INVALID_POSITION', 400);
    this.name = 'InvalidPositionError';
  }
}

export class DuplicateEntryError extends QueueError {
  constructor(delegateId: string) {
    super(`Delegate ${delegateId} is already in the queue`, 'DUPLICATE_ENTRY', 409);
    this.name = 'DuplicateEntryError';
  }
}

export class DelegateNotFoundError extends QueueError {
  constructor(delegateId: string) {
    super(`Delegate ${delegateId} not found`, 'DELEGATE_NOT_FOUND', 404);
    this.name = 'DelegateNotFoundError';
  }
}

export class QueueItemNotFoundError extends QueueError {
  constructor(itemId: string) {
    super(`Queue item ${itemId} not found`, 'QUEUE_ITEM_NOT_FOUND', 404);
    this.name = 'QueueItemNotFoundError';
  }
}

export class SessionNotFoundError extends QueueError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND', 404);
    this.name = 'SessionNotFoundError';
  }
}

export class PositionLockedError extends QueueError {
  constructor(position: number) {
    super(`Position ${position} is locked (on-deck position)`, 'POSITION_LOCKED', 403);
    this.name = 'PositionLockedError';
  }
}

export class ConcurrentModificationError extends QueueError {
  constructor(message: string = 'Concurrent modification detected') {
    super(message, 'CONCURRENT_MODIFICATION', 409);
    this.name = 'ConcurrentModificationError';
  }
}

export class QueueStateError extends QueueError {
  constructor(message: string) {
    super(message, 'QUEUE_STATE_ERROR', 500);
    this.name = 'QueueStateError';
  }
}

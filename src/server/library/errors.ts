/** Raised when a record does not exist *or* belongs to another user. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`That ${what} does not exist.`);
    this.name = "NotFoundError";
  }
}

/** Raised when a rename collides with an existing name for the same user. */
export class DuplicateNameError extends Error {
  constructor(what: string, name: string) {
    super(`You already have a ${what} called "${name}".`);
    this.name = "DuplicateNameError";
  }
}

/** Raised when a move would make a folder its own ancestor. */
export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoveError";
  }
}

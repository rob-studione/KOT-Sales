import "server-only";

/** Base class for Lost QA Gmail pipeline errors (typed failures). */
export class LostQaGmailError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LostQaGmailError";
    this.code = code;
  }
}

/** Gmail `users.history.list` startHistoryId is invalid or expired — requires watch reset / full resync. */
export class GmailHistoryInvalidError extends LostQaGmailError {
  constructor(message: string) {
    super("gmail_history_invalid", message);
    this.name = "GmailHistoryInvalidError";
  }
}

/** Mailbox has no user-visible label with name exactly `Lost`. */
export class GmailLostLabelMissingError extends LostQaGmailError {
  readonly mailboxId: string;
  readonly emailAddress: string;

  constructor(mailboxId: string, emailAddress: string) {
    super(
      "gmail_lost_label_missing",
      `Gmail mailbox ${emailAddress} (${mailboxId}) has no label named exactly "Lost".`
    );
    this.name = "GmailLostLabelMissingError";
    this.mailboxId = mailboxId;
    this.emailAddress = emailAddress;
  }
}

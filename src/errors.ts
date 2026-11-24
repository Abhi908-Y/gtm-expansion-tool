/** An error whose message is safe and useful to show the visitor (bad input, missing key, unknown plan). */
export class Bad extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

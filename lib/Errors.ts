export class ValidationError<T extends object> extends Error {
	public name = 'ValidationError';

	public errors: T;
	public keysSuffix?: string;

	constructor(errors: T, keysSuffix?: string) {
		super(`Validation error: ${JSON.stringify(errors)}`);

		this.errors = errors;
		this.keysSuffix = keysSuffix;

		Error.captureStackTrace(this);
	}

	public getErrorResponse(): {
		state: 'error';
		errors: T;
	} {
		if (this.keysSuffix) {
			const errors = {} as T;

			for (const key in this.errors) {
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore - we're sure that the key exists
				errors[`${key}${this.keysSuffix}`] = this.errors[key];
			}

			return {
				state: 'error',
				errors,
			};
		}

		return {
			state: 'error',
			errors: this.errors,
		};
	}
}

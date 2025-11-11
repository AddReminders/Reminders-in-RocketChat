export enum Durations {
	MINUTES_20 = '20',
	HOUR_1 = '60',
	HOUR_3 = '180',
	TOMORROW = 'next-day',
	NEXT_WEEK = 'next-week',
	CUSTOM = 'custom',
}

export enum ReminderRecipientsType {
	ME = 'me',
	USER = 'user',
	CHANNEL = 'channel',
}

export enum RecurringReminderFrequencies {
	DO_NOT_REPEAT = 'do-not-repeat',
	DAILY = 'daily',
	DAILY_WEEKDAYS = 'daily-weekdays',
	WEEKLY = 'weekly',
	BIWEEKLY = 'biweekly',
	TRIWEEKLY = 'triweekly',
	MONTHLY = 'monthly',
	QUARTERLY = 'quarterly',
	BIANNUALLY = 'biannually',
	ANNUALLY = 'annually',
}

export enum TimeFormats {
	_12 = '12',
	_24 = '24',
}

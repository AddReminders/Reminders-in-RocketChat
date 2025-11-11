import { RecurringReminderFrequencies, TimeFormats } from '../enums/Ui';
import { Language } from '../lib/Translation/translation';

export interface IReminderCreateModalState {
	reminder?: {
		date: string;
		time: string;
		description: string;
		target_user?: string;
		target_channel?: string;
		frequency?: RecurringReminderFrequencies;
	};
}

export interface IMsgReminderCreateModalState {
	reminder?: {
		date: string;
		time: string;
		description?: string;
	};
}

export interface IReminderSnoozeModalState {
	reminder?: {
		date: string;
		time: string;
	};
}

export interface IUserPreferenceModalState {
	language?: Language;
	timeFormat?: TimeFormats;
}

export interface IReminderEditModalState {
	reminder?: {
		date?: string;
		time?: string;
		description?: string;
		frequency?: RecurringReminderFrequencies;
	};
}

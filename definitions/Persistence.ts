import { RocketChatAssociationModel } from '@rocket.chat/apps-engine/definition/metadata';
import { JobId } from '../enums/Jobs';
import { Durations, ReminderRecipientsType } from '../enums/Ui';
import { Language } from '../lib/Translation/translation';
import { IReminder } from './IReminder';

export type IndexedProperties<T> = {
	[P in keyof T]?: 1;
};

export type StorageDefinition<T> = {
	[P in keyof T]?: RocketChatAssociationModel;
};

export type IBase<T> = {
	[key in keyof T]: string | object | boolean | number | unknown;
};

export interface IModalClickEventLock {
	viewId: string;
}

export interface IReminderCreateModalUiData {
	viewId: string;
	roomId: string;
	userId: string;
	recipientType: ReminderRecipientsType;
	userUtcOffset?: number;
}

export interface IMsgReminderCreateModalUiData {
	viewId: string;
	roomId: string;
	userId: string;
	messageId: string;
	linkedMessage: Omit<
		NonNullable<IReminder['linkedMessage']>,
		'msgAdditionalInfoPreview' | 'metadata'
	>;
	userUtcOffset: number;
	currentDuration: Durations;
}

export interface IReminderListModalActionUiData {
	viewId: string;
	currentAction: 'customSnooze' | 'bulkDelete' | 'editReminder';
	data:
		| IBulkDeleteConfirmActionData
		| ICustomSnoozeActionData
		| IEditReminderActionData;
}

export interface IEditReminderActionData {
	reminderId: string;
}

export interface IReminderListModalUiData {
	viewId: string;
	user: string; // user who opened the modal
	manageRoomReminder?: {
		roomId: string;
	};
}

export interface ICustomSnoozeModalUiData extends ICustomSnoozeActionData {
	viewId: string;
}

export interface IBulkDeleteConfirmActionData {
	reminderIds: string[];
	remindersType: 'completed' | 'past';
}

export interface ICustomSnoozeActionData {
	reminderId: string;
	utcOffset: number;
}

export interface IPreference {
	userId: string;
	language: Language;
	showTimeIn24HourFormat: boolean;
}

export type IInternalJobsLastRun = {
	[JobId.BACKUP_JOB]?: Date;
	[JobId.STATS_COLLECTOR_JOB]?: Date;
	[JobId.DAILY_REMINDER_CALCULATION_JOB]?: Date;
};

export interface IAppInstaller {
	userId: string;
	date: string;
}

export type JobIdsWithLock =
	| JobId.BACKUP_JOB
	| JobId.STATS_COLLECTOR_JOB
	| JobId.DAILY_REMINDER_CALCULATION_JOB;

export interface IInternalJobsLock {
	jobId: JobIdsWithLock;
	triggerId: string;
	lockedAt: Date;
}

import { Durations } from '../enums/Ui';
import {
	IEnvironmentRead,
	ILogger,
	IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { AppSetting, BackupInterval, ServerSetting } from '../config/Settings';
import { RecurringReminderFrequencies } from '../enums/Ui';
import {
	addHoursToDate,
	addMinutesToDate,
	formatTimeForMsg,
	getTimezoneUtcString,
	getUpcomingMondayDate,
} from './Dates';
import { Language, t } from './Translation/translation';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IPreference } from '../definitions/Persistence';

export const concatStrings = (values: Array<string>, delimiter = ''): string =>
	values.filter(Boolean).join(delimiter);

export const uuid = () => {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
};

export const getOnlyDateAsString = (date: Date): string =>
	date.toISOString().split('T')[0];

export const getOnlyTimeAsString = (
	date: Date,
	userUTCOffset: number,
): string => {
	return formatTimeForMsg(date, getTimezoneUtcString(userUTCOffset), {
		showTimeIn24HourFormat: false,
		language: Language.en,
	});
};

export const truncateString = (str: string, maxLength = 500): string => {
	if (str.length > maxLength) {
		return str.substring(0, maxLength) + '...';
	}
	return str;
};

export const getNextSnoozedDateAndMsg = (
	snoozeDuration: Durations,
	utcOffset: number,
	userPreference: IPreference,
): { nextSnoozeDate: Date; nextSnoozeMsg: string } => {
	const { language } = userPreference;
	const now = new Date();
	switch (snoozeDuration) {
		case Durations.MINUTES_20: {
			return {
				nextSnoozeDate: addMinutesToDate(now, 20),
				nextSnoozeMsg: t('in_20_minutes', language),
			};
		}
		case Durations.HOUR_1: {
			return {
				nextSnoozeDate: addMinutesToDate(now, 60),
				nextSnoozeMsg: t('in_1_hour', language),
			};
		}
		case Durations.HOUR_3: {
			return {
				nextSnoozeDate: addMinutesToDate(now, 180),
				nextSnoozeMsg: t('in_3_hours', language),
			};
		}
		case Durations.TOMORROW: {
			let dueDateUserTimezone = new Date(
				new Date().getTime() + utcOffset * 60 * 60 * 1000,
			);
			dueDateUserTimezone = addHoursToDate(dueDateUserTimezone, 24);
			dueDateUserTimezone.setUTCHours(9);
			dueDateUserTimezone.setUTCMinutes(0);
			dueDateUserTimezone.setUTCSeconds(0);
			dueDateUserTimezone.setUTCMilliseconds(0);

			const dueDateServerTimezone = new Date(
				dueDateUserTimezone.getTime() - utcOffset * 60 * 60 * 1000,
			);

			return {
				nextSnoozeDate: dueDateServerTimezone,
				nextSnoozeMsg: t('tomorrow_at_time', language, {
					time: formatTimeForMsg(
						dueDateServerTimezone,
						getTimezoneUtcString(utcOffset || 0),
						userPreference,
					),
				}),
			};
		}
		case Durations.NEXT_WEEK: {
			// next monday 9am
			let dueDateUserTimezone = new Date(
				new Date().getTime() + utcOffset * 60 * 60 * 1000,
			);
			dueDateUserTimezone = getUpcomingMondayDate(dueDateUserTimezone);
			dueDateUserTimezone.setUTCHours(9);
			dueDateUserTimezone.setUTCMinutes(0);
			dueDateUserTimezone.setUTCSeconds(0);
			dueDateUserTimezone.setUTCMilliseconds(0);

			const dueDateServerTimezone = new Date(
				dueDateUserTimezone.getTime() - utcOffset * 60 * 60 * 1000,
			);

			return {
				nextSnoozeDate: dueDateServerTimezone,
				nextSnoozeMsg: t('next_week_at_time', language, {
					time: formatTimeForMsg(
						dueDateServerTimezone,
						getTimezoneUtcString(utcOffset || 0),
						userPreference,
					),
				}),
			};
		}
		default: {
			throw new Error('Invalid snooze duration');
		}
	}
};

export const getSiteUrl = async (read: IEnvironmentRead): Promise<string> => {
	const url = await read
		.getServerSettings()
		.getValueById(ServerSetting.SITE_URL);

	// remove trailing slash
	return url.replace(/\/$/, '');
};

export const isRecurringReminder = (
	frequency: RecurringReminderFrequencies,
): boolean => frequency !== RecurringReminderFrequencies.DO_NOT_REPEAT;

export const parseBackupInterval = (interval: BackupInterval): number => {
	switch (interval) {
		case BackupInterval.Daily:
			return 24;
		case BackupInterval.Weekly:
			return 168;
		case BackupInterval.Monthly:
			return 720;
		default:
			return 24;
	}
};

export const getFormattedTime = (date: Date): string => {
	const y = date.getFullYear();
	// JavaScript months are 0-based.
	const m = date.getMonth() + 1;
	const d = date.getDate();
	const h = date.getHours();
	const mi = date.getMinutes();
	const s = date.getSeconds();
	return y + '-' + m + '-' + d + '_' + h + ':' + mi + ':' + s;
};

export const getBackupUser = async (
	read: IRead,
	logger: ILogger,
): Promise<IUser | undefined> => {
	let backupUsername: string = await read
		.getEnvironmentReader()
		.getSettings()
		.getValueById(AppSetting.BackupUser);
	if (!backupUsername) {
		logger.error(
			'Backup user not set in settings, defaulting to "rocket.cat" user',
		);
		backupUsername = 'rocket.cat';
	}

	const backupUser = await read.getUserReader().getByUsername(backupUsername);
	if (!backupUser) {
		logger.error(`Backup user ${backupUsername} not found`);
		return;
	}

	return backupUser;
};

export const getServerSettingValue = async <T>(
	read: IEnvironmentRead,
	id: string,
): Promise<T> => {
	return read.getServerSettings().getValueById(id);
};

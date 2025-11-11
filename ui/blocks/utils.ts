import { IRead } from '@rocket.chat/apps-engine/definition/accessors';
import {
	BlockBuilder,
	IOptionObject,
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RecurringReminderFrequencies } from '../../enums/Ui';
import { Language, t } from '../../lib/Translation/translation';

export const getFrequencyBlockOptions = (
	blockBuilder: BlockBuilder,
	language: Language,
): IOptionObject[] => {
	return [
		{
			text: blockBuilder.newPlainTextObject(t('do_not_repeat', language)),
			value: RecurringReminderFrequencies.DO_NOT_REPEAT,
		},
		{
			text: blockBuilder.newPlainTextObject(t('daily', language)),
			value: RecurringReminderFrequencies.DAILY,
		},
		{
			text: blockBuilder.newPlainTextObject(
				t('daily_weekdays_only', language),
			),
			value: RecurringReminderFrequencies.DAILY_WEEKDAYS,
		},
		{
			text: blockBuilder.newPlainTextObject(t('weekly', language)),
			value: RecurringReminderFrequencies.WEEKLY,
		},
		{
			text: blockBuilder.newPlainTextObject(t('biweekly', language)),
			value: RecurringReminderFrequencies.BIWEEKLY,
		},
		{
			text: blockBuilder.newPlainTextObject(t('triweekly', language)),
			value: RecurringReminderFrequencies.TRIWEEKLY,
		},
		{
			text: blockBuilder.newPlainTextObject(t('monthly', language)),
			value: RecurringReminderFrequencies.MONTHLY,
		},
		{
			text: blockBuilder.newPlainTextObject(t('quarterly', language)),
			value: RecurringReminderFrequencies.QUARTERLY,
		},
		{
			text: blockBuilder.newPlainTextObject(t('biannually', language)),
			value: RecurringReminderFrequencies.BIANNUALLY,
		},
		{
			text: blockBuilder.newPlainTextObject(t('annually', language)),
			value: RecurringReminderFrequencies.ANNUALLY,
		},
	];
};

export const convertFrequencyToText = (
	frequency: RecurringReminderFrequencies,
	language: Language,
): string => {
	switch (frequency) {
		case RecurringReminderFrequencies.DO_NOT_REPEAT:
			return '';
		case RecurringReminderFrequencies.DAILY:
			return t('every_day', language);
		case RecurringReminderFrequencies.DAILY_WEEKDAYS:
			return t('every_weekday', language);
		case RecurringReminderFrequencies.WEEKLY:
			return t('every_week', language);
		case RecurringReminderFrequencies.BIWEEKLY:
			return t('every_2_weeks', language);
		case RecurringReminderFrequencies.TRIWEEKLY:
			return t('every_3_weeks', language);
		case RecurringReminderFrequencies.MONTHLY:
			return t('every_month', language);
		case RecurringReminderFrequencies.QUARTERLY:
			return t('every_quarter', language);
		case RecurringReminderFrequencies.BIANNUALLY:
			return t('every_6_months', language);
		case RecurringReminderFrequencies.ANNUALLY:
			return t('every_year', language);
	}
};

export const resolveUserWithCache = async (
	userId: string,
	read: IRead,
	cache: Map<string, IUser>,
): Promise<IUser | undefined> => {
	if (cache.has(userId)) {
		return cache.get(userId);
	}

	const user = await read.getUserReader().getById(userId);
	if (user) {
		cache.set(userId, user);
	}
	return user;
};

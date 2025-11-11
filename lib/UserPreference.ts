import { IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { AppSetting } from '../config/Settings';
import { IPreference } from '../definitions/Persistence';
import { TimeFormats } from '../enums/Ui';
import { RemindApp } from '../RemindApp';
import { UserPreference } from './Persistence/Models';
import { Language, supportedLanguageList } from './Translation/translation';

export const getUserPreference = async (
	app: RemindApp,
	read: IPersistenceRead,
	userId: string,
): Promise<IPreference> => {
	if (!userId) {
		return {
			userId,
			language: Language.en,
			showTimeIn24HourFormat: false,
		};
	}

	const preference = await UserPreference.findOne(read, { userId });
	let parsedLanguage = preference?.language;
	if (parsedLanguage === undefined) {
		const serverDefaultLanguage = await app.getCachedValue(
			AppSetting.DefaultLanguagePreference,
		);
		parsedLanguage = serverDefaultLanguage || Language.en;
	}

	const language = isSupportedLanguage(parsedLanguage)
		? parsedLanguage
		: Language.en;

	let showTimeIn24HourFormat = preference?.showTimeIn24HourFormat;
	if (showTimeIn24HourFormat === undefined) {
		const serverDefaultShowTimeIn24HourFormat = await app.getCachedValue(
			AppSetting.DefaultTimeFormatPreference,
		);
		showTimeIn24HourFormat =
			serverDefaultShowTimeIn24HourFormat === TimeFormats._24;
	}

	return {
		userId,
		language,
		showTimeIn24HourFormat,
	};
};

export const getUserPreferredLanguage = async (
	app: RemindApp,
	read: IPersistenceRead,
	userId: string,
): Promise<Language> => {
	return (await getUserPreference(app, read, userId)).language;
};

export const isSupportedLanguage = (language: Language): boolean => {
	return supportedLanguageList.includes(language);
};

import { en } from './locales/en';
import { de } from './locales/de';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { pl } from './locales/pl';

type TranslationKey = keyof typeof en;

export enum Language {
	en = 'en',
	de = 'de',
	pt = 'pt',
	ru = 'ru',
	pl = 'pl',
}

export const supportedLanguageList = [
	Language.en,
	Language.de,
	Language.pt,
	Language.ru,
	Language.pl,
];

export const t = (
	key: TranslationKey,
	language: Language,
	params?: object,
): string => {
	const translation =
		getTranslationFile(language)[key] ||
		getTranslationFile(Language.en)[key];
	if (params) {
		return substituteParams(translation, params);
	}
	return translation;
};

const getTranslationFile = (language: Language) => {
	switch (language) {
		case Language.en:
			return en;
		case Language.de:
			return de;
		case Language.pt:
			return pt;
		case Language.ru:
			return ru;
		case Language.pl:
			return pl;
		default:
			return en;
	}
};

const substituteParams = (translation: string, params: object) => {
	return translation.replace(/__([^\s\\]+)__/g, (_, key) => {
		return params[key];
	});
};

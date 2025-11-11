import {
	BlockBuilder,
	IOptionObject,
} from '@rocket.chat/apps-engine/definition/uikit';
import { Language, t } from '../../lib/Translation/translation';

export const getLanguageBlockOptions = (
	blockBuilder: BlockBuilder,
	language: Language,
): IOptionObject[] => {
	return [
		{
			text: blockBuilder.newPlainTextObject(
				getLanguageDisplayTextFromCode(Language.en, language),
			),
			value: Language.en,
		},
		{
			text: blockBuilder.newPlainTextObject(
				getLanguageDisplayTextFromCode(Language.pt, language),
			),
			value: Language.pt,
		},
		{
			text: blockBuilder.newPlainTextObject(
				getLanguageDisplayTextFromCode(Language.de, language),
			),
			value: Language.de,
		},
		{
			text: blockBuilder.newPlainTextObject(
				getLanguageDisplayTextFromCode(Language.ru, language),
			),
			value: Language.ru,
		},
		{
			text: blockBuilder.newPlainTextObject(
				getLanguageDisplayTextFromCode(Language.pl, language),
			),
			value: Language.pl,
		},
	];
};

export const getLanguageDisplayTextFromCode = (
	code: Language,
	language: Language,
): string => {
	switch (code) {
		case Language.en: {
			return t('language_en', language);
		}
		case Language.de: {
			return t('language_de', language);
		}
		case Language.pt: {
			return t('language_pt', language);
		}
		case Language.ru: {
			return t('language_ru', language);
		}
		case Language.pl: {
			return t('language_pl', language);
		}
	}
};

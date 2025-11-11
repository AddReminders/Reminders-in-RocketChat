import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IPreference } from '../../../definitions/Persistence';
import { TimeFormats } from '../../../enums/Ui';
import { t } from '../../../lib/Translation/translation';
import { concatStrings, uuid } from '../../../lib/utils';
import { getLanguageBlockOptions } from '../../blocks/language';

export const SetUserPreferenceModalViewIdPrefix =
	'setUserPreferenceLanguageModal';

export const setUserPreferenceLanguageModal = ({
	modify,
	existingPreference,
}: {
	modify: IModify;
	existingPreference: Omit<IPreference, 'userId'>;
}): IUIKitModalViewParam => {
	const viewId = concatStrings(
		[SetUserPreferenceModalViewIdPrefix, uuid()],
		'-',
	);
	const block = modify.getCreator().getBlockBuilder();

	const { language, showTimeIn24HourFormat } = existingPreference;

	block.addInputBlock({
		blockId: 'block',
		element: block.newStaticSelectElement({
			placeholder: block.newPlainTextObject(t('language', language)),
			actionId: 'language',
			initialValue: language,
			options: getLanguageBlockOptions(block, language),
		}),
		label: block.newPlainTextObject(t('language', language)),
	});

	block.addContextBlock({
		elements: [
			block.newMarkdownTextObject(
				t('user_preference_language_description', language),
			),
		],
	});

	block.addInputBlock({
		blockId: 'block',
		element: block.newStaticSelectElement({
			placeholder: block.newPlainTextObject(t('time_format', language)),
			actionId: 'timeFormat',
			initialValue: showTimeIn24HourFormat
				? TimeFormats._24
				: TimeFormats._12,
			options: [
				{
					text: block.newPlainTextObject(
						t('time_format_12_hour', language),
					),
					value: TimeFormats._12,
				},
				{
					text: block.newPlainTextObject(
						t('time_format_24_hour', language),
					),
					value: TimeFormats._24,
				},
			],
		}),
		label: block.newPlainTextObject(t('time_format', language)),
	});

	block.addContextBlock({
		elements: [
			block.newMarkdownTextObject(
				t('user_preference_time_format_description', language),
			),
		],
	});

	return {
		id: viewId,
		title: block.newPlainTextObject(
			t('configure_your_preferences', language),
		),
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('close', language)),
		}),
		submit: block.newButtonElement({
			text: block.newPlainTextObject(t('update_my_preference', language)),
		}),
		blocks: block.getBlocks(),
	};
};

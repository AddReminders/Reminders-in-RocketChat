import { IModify } from '@rocket.chat/apps-engine/definition/accessors';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { IPreference } from '../../definitions/Persistence';
import { formatDateTimeForMsg } from '../../lib/Dates';
import { t } from '../../lib/Translation/translation';

export const reminderCreatedModal = ({
	modify,
	viewId,
	reminderDueDate,
	userUtcOffset,
	userPreference,
}: {
	modify: IModify;
	viewId: string;
	reminderDueDate: Date;
	userUtcOffset: number;
	userPreference: IPreference;
}): IUIKitModalViewParam => {
	const { language } = userPreference;
	const block = modify.getCreator().getBlockBuilder();
	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			t('okay_i_will_remind_you_about_this_at_time', language, {
				time: formatDateTimeForMsg(
					reminderDueDate,
					userUtcOffset,
					userPreference,
				),
			}),
		),
	});
	block.addActionsBlock({
		elements: [
			block.newButtonElement({
				text: block.newMarkdownTextObject(
					t('view_all_reminders', language),
				),
				actionId: 'view-all-reminders',
				style: ButtonStyle.PRIMARY,
			}),
		],
	});
	block.addSectionBlock({
		text: block.newMarkdownTextObject(
			t('tip_on_how_to_list_all_reminders', language),
		),
	});
	return {
		id: viewId,
		title: block.newMarkdownTextObject(t('reminder_created', language)),
		close: block.newButtonElement({
			text: block.newPlainTextObject(t('close', language)),
		}),
		blocks: block.getBlocks(),
	};
};
